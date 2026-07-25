// ============================================================
//  student/js/app.js
//  App bootstrap — runs once on DOMContentLoaded
//  Loads profile from API, sets up navigation
// ============================================================

const App = {

  async init() {
    Theme.init();
    this._bindNav();
    this._bindSidebar();
    await this._loadIdentity();
    Nav.go('dashboard');
  },

  /* ── load logged-in student's profile from API ─────────── */
  async _loadIdentity() {
    try {
      const d = await API.auth.me();
      if (!d.success || !d.user) return;
      const u = d.user;

      /* persist fresh user object so other pages can read it */
      window.SAL_USER = u;

      /* fill all identity slots */
      const name     = u.name     || '';
      const initials = UI.initials(name);
      const email    = u.email    || '';
      const roll     = u.rollNumber || u.roll || '';
      const dept     = u.department?.name || '';
      const college  = u.college?.name || '';

      _fill('student-name',     name);
      _fill('student-initials', initials);
      _fill('student-email',    email);
      _fill('student-roll',     roll ? 'Roll: ' + roll : '');
      _fill('student-dept',     dept);
      _fill('student-college',  college);

      /* ── Sidebar avatar ──────────────────────────────────
         /auth/me doesn't return `avatar` (it's a leaner payload
         than /student/profile), so if it's missing here, fetch
         it from /student/profile and cache it on SAL_USER so
         every page — not just Profile — has it going forward. */
      let avatar = u.avatar || null;
      if (!avatar) {
        try {
          const p = await API.student.profile();
          const student = p.profile || p.student || p.data;
          if (student?.avatar) {
            avatar = student.avatar;
            u.avatar = avatar; // keep window.SAL_USER in sync
          }
        } catch (_) {
          /* profile fetch failed — just show initials, not fatal */
        }
      }
      this._renderSidebarAvatar(avatar, initials);

      if (u.role === 'parent') await this._loadChildSwitcher();
    } catch (_) {
      /* silently fall back to auth.js values already set */
    }
  },

  /* ── shared: paint the sidebar avatar (photo or initials) ── */
  _renderSidebarAvatar(avatarUrl, initials) {
    const el = document.querySelector('.sidebar__av');
    if (!el) return;
    el.innerHTML = avatarUrl
      ? `<img src="${avatarUrl}" alt="Profile" class="sidebar-avatar-img">`
      : '';
    if (!avatarUrl) el.textContent = initials;
  },

  /* ── parent accounts can have more than one child — let them switch ── */
  async _loadChildSwitcher() {
    const box = document.getElementById('child-switcher');
    if (!box) return;
    try {
      const d = await API.student.myChildren();
      const kids = d.children || d.data?.children || [];
      if (kids.length < 2) return; // one child (or none) — nothing to switch between
      if (!window.selectedChildId) window.selectedChildId = kids[0].id;
      box.style.display = '';
      box.innerHTML = `
        <label style="font-size:11px;font-weight:700;color:var(--muted2,#9aa3bf);text-transform:uppercase;letter-spacing:.5px">Viewing</label>
        <select id="child-switcher-select" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--border,#e4e7f0);background:var(--surface,#fff);color:var(--text,#14172b)">
          ${kids.map(k => `<option value="${k.id}" ${k.id === window.selectedChildId ? 'selected' : ''}>${k.name}${k.roll ? ' (Roll ' + k.roll + ')' : ''}</option>`).join('')}
        </select>`;
      document.getElementById('child-switcher-select').addEventListener('change', e => {
        window.selectedChildId = e.target.value;
        Nav._loaders[Nav._current || 'dashboard']?.(); // force-reload current page's data for the newly selected child
      });
    } catch (_) {
      // Not critical — parent just won't see a switcher (single-child parents never need one)
    }
  },

  /* ── bottom-nav + sidebar nav clicks ───────────────────── */
  _bindNav() {
    document.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', () => Nav.go(el.dataset.page));
    });
  },

  _bindSidebar() {
    document.getElementById('sidebar-overlay')
      ?.addEventListener('click', UI.closeSidebar.bind(UI));
    document.querySelectorAll('.modal, .modal-overlay')
      ?.forEach(m => m.addEventListener('click', e => {
        if (e.target === m) UI.closeAllModals();
      }));
  },
};

/* ── helper: fill every element matching id OR class ── */
function _fill(selector, value) {
  document.querySelectorAll('#' + selector + ', .' + selector)
    .forEach(el => { el.textContent = value; });
}

/* ── Navigation controller ── */
const Nav = {
  _current: null,

  _loaders: {
    dashboard:  () => Dashboard.load(),
    attendance: () => Attendance.load(),
    notices:    () => Notices.load(),
    marks:      () => Marks.load(),
    timetable:  () => Timetable.load(),
    profile:    () => Profile.load(),
  },

  go(page) {
    if (this._current === page) return;
    this._current = page;
    UI.showPage(page);
    this._loaders[page]?.();
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());

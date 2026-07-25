// ============================================================
//  student/js/ui.js
//  Shared UI helpers — toast, loader, empty state, formatters
// ============================================================

const UI = {

  /* ── Toast ─────────────────────────────────────────────── */
  toast(msg, type = 'success', duration = 4000) {
    const box = document.getElementById('toast-container');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast toast--' + type;
    t.innerHTML = `<span class="toast__msg">${msg}</span>
                   <button class="toast__close" onclick="this.parentElement.remove()">✕</button>`;
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast--show'));
    setTimeout(() => { t.classList.remove('toast--show'); setTimeout(() => t.remove(), 300); }, duration);
  },

  /* ── Skeleton placeholder HTML ─────────────────────────── */
  skeleton(count = 3, height = 60) {
    return Array(count).fill(0).map(() =>
      `<div class="skeleton" style="height:${height}px"></div>`
    ).join('');
  },

  /* ── Empty state ────────────────────────────────────────── */
  empty(icon = '📭', title = 'Nothing here yet', sub = '') {
    return `<div class="empty-state">
      <div class="empty-state__icon">${icon}</div>
      <div class="empty-state__title">${title}</div>
      ${sub ? `<div class="empty-state__sub">${sub}</div>` : ''}
    </div>`;
  },

  /* ── Error state ────────────────────────────────────────── */
  error(msg = 'Something went wrong. Please try again.') {
    return `<div class="error-state">
      <div class="error-state__icon">⚠️</div>
      <div class="error-state__msg">${msg}</div>
    </div>`;
  },

  /* ── Date / time formatters ─────────────────────────────── */
  date(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return '—';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  },
  time(d) {
    if (!d) return '—';
    return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  },
  dateTime(d) {
    if (!d) return '—';
    return this.date(d) + ' · ' + this.time(d);
  },
  fromNow(d) {
    if (!d) return '—';
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)   return 'just now';
    if (m < 60)  return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24)  return h + 'h ago';
    const dy = Math.floor(h / 24);
    if (dy < 7)  return dy + 'd ago';
    return this.date(d);
  },

  /* ── Initials from full name ────────────────────────────── */
  initials(name = '') {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  },

  /* ── Attendance colour by percentage ───────────────────── */
  attColor(pct) {
    if (pct >= 75) return 'var(--clr-success)';
    if (pct >= 50) return 'var(--clr-warning)';
    return 'var(--clr-danger)';
  },
  attClass(pct) {
    if (pct >= 75) return 'att--good';
    if (pct >= 50) return 'att--warn';
    return 'att--low';
  },

  /* ── Badge HTML helper ──────────────────────────────────── */
  badge(text, variant = 'default') {
    return `<span class="badge badge--${variant}">${text}</span>`;
  },

  /* ── Page nav (show one section, hide others) ───────────── */
  showPage(id) {
    document.querySelectorAll('.page').forEach(p => {
      p.classList.toggle('page--active', p.id === 'page-' + id);
    });
    document.querySelectorAll('.nav__item').forEach(b => {
      b.classList.toggle('nav__item--active', b.dataset.page === id);
    });
    const title = document.getElementById('page-title');
    if (title) title.textContent = UI._pageTitles[id] || id;
    if (window.innerWidth < 768) UI.closeSidebar();
  },

  _pageTitles: {
    dashboard:  'Dashboard',
    attendance: 'My Attendance',
    syllabus:   'Syllabus',
    notices:    'Notices',
    marks:      'My Marks',
    timetable:  'Timetable',
    profile:    'My Profile',
  },

  /* ── Sidebar (mobile) ───────────────────────────────────── */
  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('sidebar--open');
    document.getElementById('sidebar-overlay').classList.toggle('overlay--show');
  },
  closeSidebar() {
    document.getElementById('sidebar').classList.remove('sidebar--open');
    document.getElementById('sidebar-overlay').classList.remove('overlay--show');
  },

  /* ── Modal ──────────────────────────────────────────────── */
  openModal(id)  { document.getElementById(id)?.classList.add('modal--open'); document.body.style.overflow = 'hidden'; },
  closeModal(id) { document.getElementById(id)?.classList.remove('modal--open'); document.body.style.overflow = ''; },
  closeAllModals() {
    document.querySelectorAll('.modal--open').forEach(m => m.classList.remove('modal--open'));
    document.body.style.overflow = '';
  },
};

/* close modals on Escape */
document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeAllModals(); });


/* ── Global shorthand: get element by id ── */
function _el(id) {
  return document.getElementById(id);
}

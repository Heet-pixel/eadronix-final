// teacher/js/ui.js — UI Utilities: Toast, Sidebar, Modals, Skeletons, Formatters

const UI = {
  // ── Toast ──
  toast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className   = 'toast' + (type === 'error' ? ' error' : '') + ' show';
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  },

  // ── Mobile sidebar ──
  toggleSb() {
    document.getElementById('sidebar').classList.toggle('mobile-open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
  },
  closeSb() {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  },

  // ── Modals ──
  openModal(id)  { document.getElementById(id).classList.add('open');    document.body.style.overflow = 'hidden'; },
  closeModal(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow = ''; },
  closeAllModals() {
    document.querySelectorAll('.modal.open, .modal-overlay.open').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
  },

  // ── Page navigation (show one .page at a time) ──
  show(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pg = document.getElementById('page-' + id);
    if (pg) pg.classList.add('active');
    // bottom-nav + sidebar-nav highlights
    document.querySelectorAll('.bn-item').forEach(b => b.classList.toggle('active', b.id === 'bn-' + id));
    document.querySelectorAll('.sn-item').forEach(b => b.classList.toggle('active', b.id === 'sni-' + id));
    window.scrollTo(0, 0);
    if (window.innerWidth < 768) UI.closeSb();
  },

  // ── Skeleton placeholders ──
  sk(n = 3, h = 44) {
    return Array(n).fill(`<div class="sk" style="height:${h}px;border-radius:6px;margin-bottom:8px"></div>`).join('');
  },

  // ── Formatters ──
  fmt(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return '—';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${dt.getFullYear()}`;
  },
  fmtDateTime(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return '—';
    const time = dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    return `${UI.fmt(d)} ${time}`;
  },
  initials(n) { return (n || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'; },
};

// Global close handlers
document.addEventListener('click',   e => { if (e.target.classList.contains('modal') || e.target.classList.contains('modal-overlay')) UI.closeAllModals(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeAllModals(); });

// Backward-compat aliases used by inline onclick attributes
function showToast(msg, type)   { UI.toast(msg, type); }
function toggleSidebar()        { UI.toggleSb(); }
function closeSidebar()         { UI.closeSb(); }
function closeStuModal()        { UI.closeModal('stuModal'); }
function closeSubjModal()       { UI.closeModal('subjDetailModal'); }

// ============================================================
// ui.js — Shared UI helpers
// ============================================================
const UI = {
  setActiveNav(section) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const t = document.querySelector(`.nav-item[data-section="${section}"]`);
    if (t) t.classList.add('active');
    document.querySelectorAll('.content-section').forEach(el => el.classList.add('hidden'));
    const c = document.getElementById(`section-${section}`);
    if (c) c.classList.remove('hidden');
    const titles = { dashboard:'Dashboard', colleges:'College Management',
      'college-detail':'College Detail', 'dept-detail':'Department Detail', analytics:'Analytics' };
    const el = document.getElementById('page-title');
    if (el) el.textContent = titles[section] || section;
    if (window.innerWidth < 768) UI.closeSidebar();
  },
  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('visible');
  },
  closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('visible');
  },
  toast(message, type='success') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    const icons = {
      success:`<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`,
      error:`<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`,
      warning:`<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`,
      info:`<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`,
    };
    t.innerHTML = `<span class="toast-icon">${icons[type]||icons.info}</span><span class="toast-msg">${message}</span><button class="toast-close" onclick="this.parentElement.remove()"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg></button>`;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4500);
  },
  openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('open');
    if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
  },
  closeAllModals() {
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
  },
  confirm({ title, message, confirmText='Confirm', type='danger', requireTypedName, onConfirm }) {
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    const btn = document.getElementById('confirm-ok-btn');
    btn.textContent = confirmText;
    btn.className   = `btn btn-${type}`;
    const wrap = document.getElementById('confirm-type-name-wrap');
    const input = document.getElementById('confirm-type-name-input');
    if (requireTypedName) {
      wrap.style.display = '';
      document.getElementById('confirm-type-name-label').textContent = `Type "${requireTypedName}" to confirm:`;
      input.value = '';
      btn.disabled = true; btn.style.opacity = '.5';
      input.oninput = () => {
        const match = input.value === requireTypedName;
        btn.disabled = !match; btn.style.opacity = match ? '1' : '.5';
      };
    } else {
      wrap.style.display = 'none';
      btn.disabled = false; btn.style.opacity = '1';
      input.oninput = null;
    }
    btn.onclick     = () => { UI.closeModal('modal-confirm'); if (onConfirm) onConfirm(); };
    UI.openModal('modal-confirm');
    if (requireTypedName) setTimeout(() => input.focus(), 50);
  },
  showLoader()  { document.getElementById('global-loader').classList.remove('hidden'); },
  hideLoader()  { document.getElementById('global-loader').classList.add('hidden'); },
  setBtnLoading(btn, loading, label='Loading...') {
    if (loading) { btn.disabled = true; btn.dataset.orig = btn.innerHTML; btn.innerHTML = `<span class="btn-spinner"></span> ${label}`; }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.orig || label; }
  },
  clearForm(formId) { const f = document.getElementById(formId); if (f) f.reset(); },
  formatDate(str) {
    if (!str) return '—';
    const dt = new Date(str);
    if (isNaN(dt)) return '—';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${dt.getFullYear()}`;
  },
  formatNum(n) { if (n===null||n===undefined) return '0'; return Number(n).toLocaleString('en-IN'); },
  getInitials(name='') { return (name||'').split(' ').filter(Boolean).map(w=>w[0]).join('').toUpperCase().slice(0,2)||'NA'; },
  // Real photo when the person has one uploaded, initials otherwise. `innerHtml`
  // lets a caller keep its existing avatar <div> classes/background styling —
  // pass what would have gone inside that div (usually just the initials).
  avatarInnerHtml(person, innerHtml) {
    return (person && person.avatar)
      ? `<img src="${person.avatar}" alt="${(person.name||'').replace(/"/g,'')}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
      : innerHtml;
  },
  pct(part, total) { if (!total) return 0; return Math.round((part/total)*100); },
  roleBadge(role) {
    const map = { super_admin:{label:'Super Admin',cls:'badge--amber'}, admin:{label:'Principal',cls:'badge--purple'},
      hod:{label:'Dept Admin',cls:'badge--blue'}, co_hod:{label:'Co-Dept Admin',cls:'badge--info'},
      teacher:{label:'Teacher',cls:'badge--green'}, student:{label:'Student',cls:'badge--success'} };
    const r = map[role] || { label: role, cls: 'badge--info' };
    return `<span class="badge ${r.cls}">${r.label}</span>`;
  },
  skeletonRows(cols, count=5) {
    const cells = Array(cols).fill(`<td><div class="skeleton-line w60"></div></td>`).join('');
    return Array(count).fill(`<tr>${cells}</tr>`).join('');
  },
  skeletonCards(count=4) {
    return Array(count).fill(`<div class="stat-card skeleton-card"><div class="skeleton-line w40"></div><div class="skeleton-line w60 mt8"></div></div>`).join('');
  },
  logout() {
    fetch('/api/auth/logout', { method:'POST', headers:{ 'Authorization':'Bearer '+localStorage.getItem('sal_token') } }).catch(()=>{});
    localStorage.clear();
    window.location.href = '/login';
  },
};

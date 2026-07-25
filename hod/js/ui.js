// hod/js/ui.js - UI Utilities: Theme, Toast, Modals, Sidebar, Helpers

let currentTheme = localStorage.getItem('sal_theme') || localStorage.getItem('hodTheme') || 'dark';

function applyTheme(t) {
  currentTheme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('sal_theme', t);
  localStorage.setItem('hodTheme', t);
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) themeBtn.textContent = t === 'dark' ? '🌙' : '☀️';
  document.getElementById('darkOpt')?.classList.toggle('active', t === 'dark');
  document.getElementById('lightOpt')?.classList.toggle('active', t === 'light');
}

function setTheme(t) {
  applyTheme(t);
  showToast('Theme updated to ' + (t === 'dark' ? 'Dark' : 'Light') + ' Mode');
}

function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

applyTheme(currentTheme);

function showToast(msg, isErr) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = (isErr ? '✖ ' : '✓ ') + msg;
  t.className = 'toast' + (isErr ? ' error' : '') + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
}

function closeAllModals(){
  const ids=['studentModal','teacherModal','lecHistModal','stuMarksModal',
             'allStuOverlay','allTchrOverlay','stuExcelOverlay','tchrExcelOverlay',
             'deleteOverlay','deleteTchrOverlay','promoteOverlay'];
  ids.forEach(id=>{
    let el=document.getElementById(id);
    if(el) el.classList.remove('open');
  });
  stuEditMode=false; tchrEditMode=false;
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${dt.getFullYear()}`;
}
function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const time = dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${fmtDate(d)} ${time}`;
}

function updateDate() {
  const d = new Date();
  const el = document.getElementById('topDate');
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' });
  if (el) el.textContent = `${weekday}, ${fmtDate(d)}`;
}
updateDate();

function toggleMobileSidebar(){
  let sidebar=document.getElementById('mainSidebar');
  let overlay=document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('mobile-open');
  overlay.classList.toggle('open');
}

function closeMobileSidebar(){
  let sidebar=document.getElementById('mainSidebar');
  let overlay=document.getElementById('sidebarOverlay');
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('open');
}

document.querySelectorAll('.nav-item').forEach(el=>{
  el.addEventListener('click',()=>{
    if(window.innerWidth<=768) closeMobileSidebar();
  });
});

// Spec item 5: hard delete only — every delete action shows a clear
// "this is permanent" warning and requires typing the exact name before
// the delete button will do anything. Replaces plain confirm()/window.confirm
// calls for destructive deletes specifically.
function confirmDeleteModal({ itemLabel = 'record', name, onConfirm }) {
  document.getElementById('confirmDeleteOverlay')?.remove();
  const safeName = String(name || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = `
    <div class="modal-overlay open" id="confirmDeleteOverlay" onclick="if(event.target===this) this.remove()">
      <div class="modal-card" style="max-width:420px">
        <div class="modal-header"><span>⚠ Permanently Delete ${itemLabel}</span><button onclick="document.getElementById('confirmDeleteOverlay').remove()">✕</button></div>
        <div class="modal-body" style="padding:20px">
          <p style="margin:0 0 14px;font-size:14px">This will permanently delete <strong>${safeName}</strong> from the system. This cannot be undone.</p>
          <p style="margin:0 0 6px;font-size:13px">Type <strong>${safeName}</strong> to confirm:</p>
          <input type="text" id="confirmDeleteInput" style="width:100%;padding:9px;border:1px solid var(--border,#ccc);border-radius:8px;margin-bottom:14px" autocomplete="off">
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" onclick="document.getElementById('confirmDeleteOverlay').remove()">Cancel</button>
            <button class="btn btn-danger" id="confirmDeleteBtn" disabled style="opacity:.5;cursor:not-allowed">Permanently Delete</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const input = document.getElementById('confirmDeleteInput');
  const btn = document.getElementById('confirmDeleteBtn');
  input.addEventListener('input', () => {
    const match = input.value === name;
    btn.disabled = !match;
    btn.style.opacity = match ? '1' : '.5';
    btn.style.cursor = match ? 'pointer' : 'not-allowed';
  });
  btn.addEventListener('click', async () => {
    document.getElementById('confirmDeleteOverlay')?.remove();
    await onConfirm();
  });
  input.focus();
}

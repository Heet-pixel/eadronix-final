// js/notices.js — Notices: send + view sent by admin or HODs
const Notices = {
  _filter: 'all',

  async load() {
    UI.setNav('notices');
    await Notices._fetch();
  },

  async _fetch() {
    const el = document.getElementById('notice-list');
    el.innerHTML = UI.sk(3, 80);
    const q = Notices._filter !== 'all' ? `sentBy=${Notices._filter}` : '';
    try {
      const d = await apiJson('/api/admin/notices' + (q ? '?' + q : ''));
      const list = d.data || d.notices || [];
      Notices._render(list);
    } catch (e) {
      el.innerHTML = `<div style="color:var(--red);padding:16px">${e.message}</div>`;
    }
  },

  _render(list) {
    const el = document.getElementById('notice-list');
    if (!list.length) {
      el.innerHTML = '<div class="empty">No notices yet.</div>';
      return;
    }
    const priorityColor = { Normal: 'bw', Important: '', Urgent: 'br' };
    const priorityStyle = { Important: 'background:#fff3e0;color:var(--amber);border-color:rgba(230,81,0,.3)' };
    el.innerHTML = list.map(n => `
      <div class="notice-card">
        <div class="nc-header">
          <div class="nc-title">${n.title}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="badge ${priorityColor[n.priority] || 'bw'}" ${priorityStyle[n.priority] ? `style="${priorityStyle[n.priority]}"` : ''}>${n.priority || 'Normal'}</span>
            <span class="badge bw">To: ${n.targetRole || n.audience || 'All'}</span>
            ${n.department ? `<span class="badge" style="background:var(--blue-light);color:var(--blue)">Dept: ${n.department?.name || n.department}</span>` : ''}
            <span style="font-size:11px;color:var(--text3)">${UI.fmt(n.createdAt)}</span>
            <button class="ibtn del" onclick="Notices.del('${n._id || n.id}','${(n.title || 'this notice').replace(/'/g, "\\'")}')">🗑</button>
          </div>
        </div>
        <div class="nc-body">${n.body || n.msg || ''}</div>
        ${n.attachment ? `<div class="nc-attachment"><a href="${n.attachment}" download="${n.attachmentName || 'Notice.pdf'}">📎 ${n.attachmentName || 'Download PDF'}</a></div>` : ''}
        <div class="nc-meta">
          <span class="nc-sent-by">✉️ Sent by: ${n.createdBy?.name || n.sentBy || 'Principal'}</span>
          <span>${n.targetRole === 'all' || !n.targetRole ? '📢 All Staff & Students' : '🎯 ' + (n.targetRole || 'All')}</span>
        </div>
      </div>`).join('');
  },

  setFilter(f) {
    Notices._filter = f;
    document.querySelectorAll('.notice-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.f === f));
    Notices._fetch();
  },

  async send() {
    const title = document.getElementById('notice-title').value.trim();
    const body = document.getElementById('notice-body').value.trim();
    const targetRole = document.getElementById('notice-role').value;
    const priority = document.getElementById('notice-priority').value;
    const deptId = document.getElementById('notice-dept').value;
    const course = document.getElementById('notice-course')?.value.trim();
    const semester = document.getElementById('notice-semester')?.value;
    if (!title || !body) { UI.toast('Fill title and message', 'error'); return; }

    const fileInput = document.getElementById('notice-file');
    const file = fileInput && fileInput.files[0];
    let attachment, attachmentName;
    if (file) {
      if (file.type !== 'application/pdf') { UI.toast('Only PDF attachments are supported.', 'error'); return; }
      if (file.size > 5 * 1024 * 1024) { UI.toast('PDF is too large (max 5MB).', 'error'); return; }
      try {
        attachment = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Could not read the file.'));
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        attachmentName = file.name;
      } catch (e) { UI.toast(e.message, 'error'); return; }
    }

    try {
      await apiJson('/api/admin/notices', { method: 'POST', body: JSON.stringify({
        title, body, targetRole, priority, departmentId: deptId || undefined,
        course: course || undefined, semester: semester || undefined,
        attachment, attachmentName,
      }) });
      UI.toast('Notice published ✅');
      UI.closeAll();
      document.getElementById('notice-form').reset();
      await Notices._fetch();
    } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
  },

  async del(id, title) {
    UI.confirmDelete({ itemLabel: 'notice', name: title || 'this notice', onConfirm: async () => {
      try {
        await apiJson('/api/admin/notices/' + id, { method: 'DELETE' });
        UI.toast('Notice permanently deleted');
        await Notices._fetch();
      } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
    }});
  },

  async openSend() {
    document.getElementById('notice-form').reset();
    // Populate dept dropdown
    try {
      const d = await apiJson('/api/admin/departments');
      const list = d.data || d.departments || [];
      const el = document.getElementById('notice-dept');
      if (el) el.innerHTML = '<option value="">— All Departments —</option>' +
        list.map(dep => `<option value="${dep._id || dep.id}">${dep.name}</option>`).join('');
    } catch { /* silently fail */ }
    UI.openModal('modal-notice');
  },
};

// js/teachers.js — Teachers list with search
const Teachers = {
  _page: 1, _search: '',

  async load() {
    UI.setNav('teachers');
    Teachers._bindSearch();
    await Teachers._fetch();
  },

  _bindSearch() {
    const si = document.getElementById('teacher-search');
    if (!si || si._b) return;
    si._b = true;
    let t;
    si.addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => { Teachers._search = e.target.value; Teachers._page = 1; Teachers._fetch(); }, 350);
    });
  },

  async _fetch() {
    const tbody = document.getElementById('teacher-tbody');
    tbody.innerHTML = `<tr><td colspan="7">${UI.sk(4, 38)}</td></tr>`;
    const q = [`page=${Teachers._page}`, 'limit=20', Teachers._search ? `search=${encodeURIComponent(Teachers._search)}` : ''].filter(Boolean).join('&');
    try {
      const d = await apiJson('/api/admin/teachers?' + q);
      const list = d.data || d.teachers || [];
      const meta = d.meta || {};
      document.getElementById('teacher-count').textContent = `(${UI.num(meta.total || list.length)})`;
      tbody.innerHTML = list.length ? list.map((t, i) => `
        <tr>
          <td>${(Teachers._page - 1) * 20 + i + 1}</td>
          <td><div style="display:flex;align-items:center;gap:8px">
            <div class="av">${UI.initials(t.name)}</div>
            <div><div style="font-weight:500">${t.name}</div>
            <div style="font-size:11px;color:var(--text3)">${t.email || '—'}</div></div>
          </div></td>
          <td>${t.department?.name || t.dept || '—'}</td>
          <td>${t.qualification || t.qual || '—'}</td>
          <td>${t.experience ? t.experience + ' yrs' : '—'}</td>
          <td>${t.mobile || '—'}</td>
          <td><span class="badge ${t.isActive !== false ? 'bg' : 'br'}">${t.isActive !== false ? 'Active' : 'Inactive'}</span></td>
          <td>
            <button class="ibtn" title="${t.isActive ? 'Deactivate' : 'Activate'}" onclick="Teachers.toggle('${t._id || t.id}','${t.name}',${t.isActive !== false})">${t.isActive !== false ? '⏸' : '▶'}</button>
            <button class="ibtn del" title="Delete" onclick="Teachers.del('${t._id || t.id}','${t.name}')">🗑</button>
          </td>
        </tr>`).join('')
        : UI.emptyRow(8, Teachers._search ? `No teachers matching "${Teachers._search}"` : 'No teachers found.');
      Teachers._renderPager(meta);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
    }
  },

  _renderPager(meta) {
    const el = document.getElementById('teacher-pager');
    if (!meta || meta.totalPages <= 1) { if (el) el.innerHTML = ''; return; }
    el.innerHTML =
      `<button class="pb${meta.page <= 1 ? ' dis' : ''}" onclick="Teachers._page=${meta.page - 1};Teachers._fetch()">‹</button>` +
      Array.from({ length: meta.totalPages }, (_, i) =>
        `<button class="pb${i + 1 === meta.page ? ' act' : ''}" onclick="Teachers._page=${i + 1};Teachers._fetch()">${i + 1}</button>`
      ).join('') +
      `<button class="pb${meta.page >= meta.totalPages ? ' dis' : ''}" onclick="Teachers._page=${meta.page + 1};Teachers._fetch()">›</button>`;
  },

  async add() {
    const name = document.getElementById('t-name').value.trim();
    const email = document.getElementById('t-email').value.trim();
    const mobile = document.getElementById('t-mobile').value.trim();
    const dept = document.getElementById('t-dept').value;
    const qual = document.getElementById('t-qual').value.trim();
    const exp = document.getElementById('t-exp').value;
    if (!name || !email) { UI.toast('Name and email required', 'error'); return; }
    try {
      await apiJson('/api/admin/teachers', { method: 'POST', body: JSON.stringify({ name, email, mobile, departmentId: dept, qualification: qual, experience: exp }) });
      UI.toast('Teacher added');
      UI.closeAll();
      document.getElementById('teacher-form').reset();
      await Teachers._fetch();
    } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
  },

  async toggle(id, name, active) {
    if (!confirm(`${active ? 'Deactivate' : 'Activate'} ${name}?`)) return;
    try {
      await apiJson('/api/admin/users/' + id + '/toggle', { method: 'POST' });
      UI.toast(active ? 'Deactivated' : 'Activated');
      await Teachers._fetch();
    } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
  },

  async del(id, name) {
    UI.confirmDelete({ itemLabel: 'teacher', name, onConfirm: async () => {
      try {
        await apiJson('/api/admin/users/' + id, { method: 'DELETE' });
        UI.toast('Permanently deleted');
        await Teachers._fetch();
      } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
    }});
  },

  async openAddModal() {
    document.getElementById('teacher-form').reset();
    // Populate dept dropdown
    try {
      const d = await apiJson('/api/admin/departments');
      const list = d.data || d.departments || [];
      document.getElementById('t-dept').innerHTML = '<option value="">— Select Department —</option>' +
        list.map(dep => `<option value="${dep._id || dep.id}">${dep.name}</option>`).join('');
    } catch { /* silently fail */ }
    UI.openModal('modal-teacher');
  },
};

// js/hod.js — HOD / Co-HOD management
// Spec (updated): Admin has full control here — add, edit, remove. Super
// Admin can only VIEW (see super-admin/js/staff.js and dept-detail.js — their
// edit/delete controls are hidden for hod/co_hod, and the backend blocks
// those actions too as defense in depth). Whoever appoints one, the other
// role sees it too, since both just read the same User collection scoped to
// the college.
const HOD = {
  _editingId: null,

  async load() {
    UI.setNav('hod');
    await HOD._fetch();
  },

  async _fetch() {
    const tbody = document.getElementById('hod-tbody');
    tbody.innerHTML = `<tr><td colspan="8">${UI.sk(4, 38)}</td></tr>`;
    try {
      const d = await apiJson('/api/admin/hod');
      const list = d.hods || d.data?.hods || [];
      document.getElementById('hod-count').textContent = `(${UI.num(list.length)})`;
      tbody.innerHTML = list.length ? list.map((h, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><div style="display:flex;align-items:center;gap:8px">
            ${avatarCell(h)}
            <div><div style="font-weight:500">${h.name}</div></div>
          </div></td>
          <td><span class="badge ${h.role === 'co_hod' ? 'bg' : 'bp'}">${h.role === 'co_hod' ? 'Co-HOD' : 'HOD'}</span></td>
          <td>${h.department?.name || h.dept || '—'}</td>
          <td>${h.email || '—'}</td>
          <td>${h.mobile || h.phone || '—'}</td>
          <td><span class="badge ${h.isActive !== false ? 'bg' : 'br'}">${h.isActive !== false ? 'Active' : 'Inactive'}</span></td>
          <td style="white-space:nowrap">
            <button class="ibtn" title="Edit" onclick='HOD.openEditModal(${JSON.stringify(h).replace(/'/g, "&#39;")})'>✎</button>
            <button class="ibtn del" title="Remove" onclick="HOD.del('${h._id || h.id}','${h.name}')">🗑</button>
          </td>
        </tr>`).join('')
        : UI.emptyRow(8, 'No HOD or Co-HOD appointed yet.');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
    }
  },

  async _loadDeptOptions(selectedId) {
    try {
      const d = await apiJson('/api/admin/departments');
      const list = d.data || d.departments || [];
      document.getElementById('h-dept').innerHTML = '<option value="">— Select Department —</option>' +
        list.map(dep => `<option value="${dep._id || dep.id}" ${String(dep._id || dep.id) === String(selectedId) ? 'selected' : ''}>${dep.name}</option>`).join('');
    } catch { /* silently fail */ }
  },

  async openAddModal() {
    HOD._editingId = null;
    document.getElementById('hod-form').reset();
    document.getElementById('hod-modal-title').textContent = 'Appoint HOD / Co-HOD';
    document.getElementById('hod-submit-btn').textContent = '➕ Appoint';
    document.getElementById('h-role').disabled = false;
    await HOD._loadDeptOptions();
    UI.openModal('modal-hod');
  },

  async openEditModal(h) {
    HOD._editingId = h._id || h.id;
    document.getElementById('hod-modal-title').textContent = `Edit ${h.role === 'co_hod' ? 'Co-HOD' : 'HOD'}`;
    document.getElementById('hod-submit-btn').textContent = '💾 Save Changes';
    document.getElementById('h-name').value = h.name || '';
    document.getElementById('h-email').value = h.email || '';
    document.getElementById('h-mobile').value = h.mobile || h.phone || '';
    document.getElementById('h-qual').value = h.qualification || '';
    document.getElementById('h-role').value = h.role || 'hod';
    // Role/department aren't changed via edit — moving someone to a
    // different department/role is a remove-and-re-appoint, to keep the
    // "max one HOD + one Co-HOD per department" rule simple and unambiguous.
    document.getElementById('h-role').disabled = true;
    await HOD._loadDeptOptions(h.department?._id || h.department);
    document.getElementById('h-dept').disabled = true;
    UI.openModal('modal-hod');
  },

  async add() {
    if (HOD._editingId) return HOD._save();
    const dept = document.getElementById('h-dept').value;
    const role = document.getElementById('h-role').value;
    const name = document.getElementById('h-name').value.trim();
    const email = document.getElementById('h-email').value.trim();
    const mobile = document.getElementById('h-mobile').value.trim();
    const qual = document.getElementById('h-qual').value.trim();
    if (!dept || !name || !email) { UI.toast('Department, name and email are required', 'error'); return; }
    try {
      await apiJson('/api/admin/hod', { method: 'POST', body: JSON.stringify({ departmentId: dept, role, name, email, mobile, qualification: qual }) });
      UI.toast(`${role === 'co_hod' ? 'Co-HOD' : 'HOD'} appointed`);
      HOD._closeModal();
      await HOD._fetch();
    } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
  },

  async _save() {
    const name = document.getElementById('h-name').value.trim();
    const email = document.getElementById('h-email').value.trim();
    const mobile = document.getElementById('h-mobile').value.trim();
    const qual = document.getElementById('h-qual').value.trim();
    if (!name || !email) { UI.toast('Name and email are required', 'error'); return; }
    try {
      await apiJson('/api/admin/hod/' + HOD._editingId, { method: 'PUT', body: JSON.stringify({ name, email, mobile, phone: mobile, qualification: qual }) });
      UI.toast('Saved');
      HOD._closeModal();
      await HOD._fetch();
    } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
  },

  _closeModal() {
    UI.closeAll();
    document.getElementById('h-dept').disabled = false;
    document.getElementById('h-role').disabled = false;
    HOD._editingId = null;
  },

  async del(id, name) {
    UI.confirmDelete({ itemLabel: 'HOD/Co-HOD', name, onConfirm: async () => {
      try {
        await apiJson('/api/admin/hod/' + id, { method: 'DELETE' });
        UI.toast('Permanently deleted');
        await HOD._fetch();
      } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
    }});
  },
};

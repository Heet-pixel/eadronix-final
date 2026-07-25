// js/courses.js — Courses: dept boxes → course list per dept
const Courses = {
  _depts: [],
  _selectedDept: null,

  async load() {
    UI.setNav('courses');
    Courses._selectedDept = null;
    document.getElementById('courses-dept-view').classList.remove('hidden');
    document.getElementById('courses-list-view').classList.add('hidden');
    await Courses._loadDepts();
  },

  async _loadDepts() {
    const grid = document.getElementById('courses-dept-boxes');
    grid.innerHTML = Array(4).fill('<div class="dept-box sk" style="height:140px"></div>').join('');
    try {
      const d = await apiJson('/api/admin/departments');
      Courses._depts = d.data || d.departments || [];
      const icons = { 'fa-laptop-code': '💻', 'fa-atom': '⚛️', 'fa-flask': '🧪', 'fa-calculator': '🔢', 'fa-bolt': '⚡', 'fa-cogs': '⚙️', 'fa-heartbeat': '❤️', 'fa-paint-brush': '🎨', 'fa-chart-line': '📈', 'fa-building': '🏛️' };
      if (!Courses._depts.length) {
        grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No departments found. Create a department first.</div>';
        return;
      }
      grid.innerHTML = Courses._depts.map(dept => `
        <div class="dept-box" onclick="Courses.openDept('${dept._id || dept.id}')">
          <div class="dept-box-icon">${icons[dept.icon] || '🏛️'}</div>
          <div class="dept-box-name">${dept.name}</div>
          <div class="dept-box-code">${dept.code || ''}</div>
          <div class="dept-box-meta">
            <div class="dept-box-stat">📚 ${dept.courseCount ?? 0} courses</div>
          </div>
        </div>`).join('');
    } catch (e) {
      grid.innerHTML = `<div style="color:var(--red);padding:16px">Failed: ${e.message}</div>`;
    }
  },

  async openDept(deptId) {
    const dept = Courses._depts.find(d => (d._id || d.id) === deptId);
    if (!dept) return;
    Courses._selectedDept = dept;
    document.getElementById('courses-dept-view').classList.add('hidden');
    document.getElementById('courses-list-view').classList.remove('hidden');
    document.getElementById('courses-dept-name').textContent = dept.name;
    document.getElementById('courses-dept-sub').textContent = dept.code || '';
    await Courses._loadList(deptId);
  },

  async _loadList(deptId) {
    const tbody = document.getElementById('courses-tbody');
    tbody.innerHTML = `<tr><td colspan="6">${UI.sk(3, 38)}</td></tr>`;
    try {
      const d = await apiJson('/api/admin/courses?department=' + deptId);
      const list = d.data || d.courses || [];
      document.getElementById('courses-count').textContent = `${list.length} course${list.length !== 1 ? 's' : ''}`;
      tbody.innerHTML = list.length ? list.map((c, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${c.name}</strong></td>
          <td>${c.duration || '—'}</td>
          <td><span class="badge bw">${c.type || '—'}</span></td>
          <td>${c.totalSeats ?? '—'}</td>
          <td>${c.studentCount ?? 0}</td>
          <td style="text-align:right;display:flex;gap:6px;justify-content:flex-end">
            <button class="ibtn edit" onclick='Courses._editCourse(${JSON.stringify(c)})'>✏️</button>
            <button class="ibtn del" onclick="Courses._deleteCourse('${c._id || c.id}','${c.name}')">🗑</button>
          </td>
        </tr>`).join('')
        : `<tr><td colspan="7" class="empty">No courses for this department yet.</td></tr>`;
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
    }
  },

  backToDepts() {
    Courses._selectedDept = null;
    document.getElementById('courses-dept-view').classList.remove('hidden');
    document.getElementById('courses-list-view').classList.add('hidden');
  },

  openAdd() {
    const dept = Courses._selectedDept;
    if (!dept) return;
    document.getElementById('course-form').reset();
    document.getElementById('course-id').value = '';
    document.getElementById('course-dept-id').value = dept._id || dept.id;
    document.getElementById('course-dept-label').textContent = dept.name;
    document.getElementById('course-modal-title').textContent = `Add Course — ${dept.name}`;
    UI.openModal('modal-course');
  },

  _editCourse(c) {
    document.getElementById('course-id').value = c._id || c.id || '';
    document.getElementById('course-dept-id').value = c.departmentId || (c.department?._id || Courses._selectedDept?._id || '');
    document.getElementById('course-name').value = c.name || '';
    document.getElementById('course-duration').value = c.duration || '3 Years';
    document.getElementById('course-type').value = c.type || 'UG';
    document.getElementById('course-seats').value = c.totalSeats || '';
    document.getElementById('course-modal-title').textContent = 'Edit Course';
    UI.openModal('modal-course');
  },

  async save() {
    const id = document.getElementById('course-id').value;
    const deptId = document.getElementById('course-dept-id').value;
    const name = document.getElementById('course-name').value.trim();
    const duration = document.getElementById('course-duration').value;
    const type = document.getElementById('course-type').value;
    const seats = document.getElementById('course-seats').value;
    if (!name) { UI.toast('Course name required', 'error'); return; }
    try {
      const body = { name, departmentId: deptId, duration, type, totalSeats: seats || undefined };
      if (id) {
        await apiJson('/api/admin/courses/' + id, { method: 'PUT', body: JSON.stringify(body) });
        UI.toast('Course updated');
      } else {
        await apiJson('/api/admin/courses', { method: 'POST', body: JSON.stringify(body) });
        UI.toast('Course added');
      }
      UI.closeAll();
      if (Courses._selectedDept) await Courses._loadList(Courses._selectedDept._id || Courses._selectedDept.id);
    } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
  },

  async _deleteCourse(id, name) {
    UI.confirmDelete({ itemLabel: 'course', name, onConfirm: async () => {
      try {
        await apiJson('/api/admin/courses/' + id, { method: 'DELETE' });
        UI.toast('Course permanently deleted');
        if (Courses._selectedDept) await Courses._loadList(Courses._selectedDept._id || Courses._selectedDept.id);
      } catch (e) { UI.toast(e.message || 'Delete failed', 'error'); }
    }});
  },
};

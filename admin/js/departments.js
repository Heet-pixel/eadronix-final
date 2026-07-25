// js/departments.js — Departments: box grid + dept detail with courses
const Departments = {
  _list: [],
  _selectedDept: null,

  async load() {
    UI.setNav('departments');
    Departments._selectedDept = null;
    document.getElementById('dept-box-view').classList.remove('hidden');
    document.getElementById('dept-detail-view').classList.add('hidden');
    await Departments._fetchAndRender();
  },

  async _fetchAndRender() {
    const grid = document.getElementById('dept-boxes');
    grid.innerHTML = Array(4).fill('<div class="dept-box sk" style="height:160px"></div>').join('');
    try {
      const d = await apiJson('/api/admin/departments');
      Departments._list = d.data || d.departments || [];
      Departments._renderBoxes(Departments._list);
    } catch (e) {
      grid.innerHTML = `<div style="color:var(--red);padding:16px">Failed: ${e.message}</div>`;
    }
  },

  _renderBoxes(list) {
    const grid = document.getElementById('dept-boxes');
    if (!list.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No departments yet. Create one above.</div>';
      return;
    }
    const icons = { 'fa-laptop-code': '💻', 'fa-atom': '⚛️', 'fa-flask': '🧪', 'fa-calculator': '🔢', 'fa-bolt': '⚡', 'fa-cogs': '⚙️', 'fa-heartbeat': '❤️', 'fa-paint-brush': '🎨', 'fa-chart-line': '📈', 'fa-building': '🏛️' };
    grid.innerHTML = list.map(dept => `
      <div class="dept-box" onclick="Departments.openDetail('${dept._id || dept.id}')">
        <div class="dept-box-actions" onclick="event.stopPropagation()">
          <button class="ibtn edit" title="Edit" onclick='Departments.openEdit(${JSON.stringify(dept)})'>✏️</button>
          <button class="ibtn del" title="Delete" onclick="Departments.deleteDept('${dept._id || dept.id}','${dept.name}')">🗑</button>
        </div>
        <div class="dept-box-icon">${icons[dept.icon] || '🏛️'}</div>
        <div class="dept-box-name">${dept.name}</div>
        <div class="dept-box-code">${dept.code || ''}${dept.establishedYear ? ' · Est. ' + dept.establishedYear : ''}</div>
        <div class="dept-box-meta">
          <div class="dept-box-stat">👨‍🎓 ${dept.studentCount ?? 0}</div>
          <div class="dept-box-stat">👩‍🏫 ${dept.teacherCount ?? 0}</div>
          <div class="dept-box-stat">📚 ${dept.courseCount ?? 0}</div>
        </div>
        <div class="dept-box-hod">🎓 Head: ${dept.hodId?.name || dept.hod || 'Not assigned'}</div>
      </div>`).join('');
  },

  async openDetail(deptId) {
    const dept = Departments._list.find(d => (d._id || d.id) === deptId);
    if (!dept) return;
    Departments._selectedDept = dept;
    document.getElementById('dept-box-view').classList.add('hidden');
    document.getElementById('dept-detail-view').classList.remove('hidden');
    // Render dept header
    const icons = { 'fa-laptop-code': '💻', 'fa-atom': '⚛️', 'fa-flask': '🧪', 'fa-calculator': '🔢', 'fa-bolt': '⚡', 'fa-cogs': '⚙️', 'fa-heartbeat': '❤️', 'fa-paint-brush': '🎨', 'fa-chart-line': '📈', 'fa-building': '🏛️' };
    document.getElementById('dept-detail-icon').textContent = icons[dept.icon] || '🏛️';
    document.getElementById('dept-detail-name').textContent = dept.name;
    document.getElementById('dept-detail-sub').textContent =
      `${dept.code || ''} · Head: ${dept.hodId?.name || 'Not assigned'} · ${dept.courseCount ?? 0} Courses`;
    // Load courses for this dept
    await Departments._loadCourses(deptId, dept.name);
  },

  async _loadCourses(deptId, deptName) {
    const grid = document.getElementById('dept-course-grid');
    grid.innerHTML = Array(3).fill('<div class="course-card sk" style="height:120px"></div>').join('');
    try {
      const d = await apiJson('/api/admin/courses?department=' + deptId);
      const list = d.data || d.courses || [];
      document.getElementById('dept-course-count').textContent = `${list.length} Course${list.length !== 1 ? 's' : ''}`;
      if (!list.length) {
        grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No courses yet. Create one for this department.</div>';
        return;
      }
      const typeColors = { UG: '#e3f0ff', PG: '#f3e5f5', Diploma: '#fff3e0', PhD: '#e8f5e9' };
      const typeText = { UG: 'var(--blue)', PG: '#6a1b9a', Diploma: 'var(--amber)', PhD: 'var(--green)' };
      grid.innerHTML = list.map(c => `
        <div class="course-card">
          <div class="course-card-name">${c.name}</div>
          <span class="course-card-type" style="background:${typeColors[c.type] || 'var(--blue-light)'};color:${typeText[c.type] || 'var(--blue)'}">${c.type || 'UG'}</span>
          <div class="course-card-meta">
            ⏱ ${c.duration || '—'} &nbsp;·&nbsp; 💺 ${c.totalSeats ?? '—'} seats<br>
            <span style="margin-top:4px;display:block">👨‍🎓 ${c.studentCount ?? 0} enrolled</span>
          </div>
          <div class="course-card-actions">
            <button class="btn btn-g btn-sm" style="flex:1" onclick="Departments._editCourse(${JSON.stringify(c).replace(/'/g, '&apos;')})">✏️ Edit</button>
            <button class="ibtn del" onclick="Departments._deleteCourse('${c._id || c.id}','${c.name}')">🗑</button>
          </div>
        </div>`).join('');
    } catch (e) {
      grid.innerHTML = `<div style="color:var(--red);padding:16px">Failed: ${e.message}</div>`;
    }
  },

  backToList() {
    document.getElementById('dept-box-view').classList.remove('hidden');
    document.getElementById('dept-detail-view').classList.add('hidden');
    Departments._selectedDept = null;
  },

  openCreate() {
    document.getElementById('dept-form').reset();
    document.getElementById('dept-id').value = '';
    document.getElementById('dept-modal-title').textContent = 'New Department';
    UI.openModal('modal-dept');
  },

  openEdit(dept) {
    document.getElementById('dept-id').value = dept._id || dept.id || '';
    document.getElementById('dept-name').value = dept.name || '';
    document.getElementById('dept-code').value = dept.code || '';
    document.getElementById('dept-year').value = dept.establishedYear || '';
    document.getElementById('dept-desc').value = dept.description || '';
    document.getElementById('dept-icon').value = dept.icon || 'fa-building';
    document.getElementById('dept-modal-title').textContent = 'Edit Department';
    UI.openModal('modal-dept');
  },

  async save() {
    const id = document.getElementById('dept-id').value;
    const name = document.getElementById('dept-name').value.trim();
    const code = document.getElementById('dept-code').value.trim();
    const year = document.getElementById('dept-year').value;
    const desc = document.getElementById('dept-desc').value.trim();
    const icon = document.getElementById('dept-icon').value;
    if (!name || !code) { UI.toast('Name and code required', 'error'); return; }
    try {
      const body = { name, code, establishedYear: year || undefined, icon, description: desc };
      if (id) {
        await apiJson('/api/admin/departments/' + id, { method: 'PUT', body: JSON.stringify(body) });
        UI.toast('Department updated');
      } else {
        await apiJson('/api/admin/departments', { method: 'POST', body: JSON.stringify(body) });
        UI.toast('Department created');
      }
      UI.closeAll();
      await Departments._fetchAndRender();
    } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
  },

  async deleteDept(id, name) {
    UI.confirmDelete({ itemLabel: 'department', name, onConfirm: async () => {
      try {
        await apiJson('/api/admin/departments/' + id, { method: 'DELETE' });
        UI.toast('Department permanently deleted');
        await Departments._fetchAndRender();
      } catch (e) { UI.toast(e.message || 'Delete failed', 'error'); }
    }});
  },

  // ── Course management inside dept ────────────────
  openAddCourse() {
    const dept = Departments._selectedDept;
    if (!dept) return;
    document.getElementById('course-form').reset();
    document.getElementById('course-id').value = '';
    document.getElementById('course-dept-id').value = dept._id || dept.id;
    document.getElementById('course-dept-label').textContent = dept.name;
    document.getElementById('course-modal-title').textContent = `Add Course — ${dept.name}`;
    UI.openModal('modal-course');
  },

  _editCourse(course) {
    document.getElementById('course-id').value = course._id || course.id || '';
    document.getElementById('course-dept-id').value = course.departmentId || (course.department?._id || '');
    document.getElementById('course-name').value = course.name || '';
    document.getElementById('course-duration').value = course.duration || '3 Years';
    document.getElementById('course-type').value = course.type || 'UG';
    document.getElementById('course-seats').value = course.totalSeats || '';
    document.getElementById('course-modal-title').textContent = 'Edit Course';
    UI.openModal('modal-course');
  },

  async saveCourse() {
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
      if (Departments._selectedDept) {
        await Departments._loadCourses(Departments._selectedDept._id || Departments._selectedDept.id, Departments._selectedDept.name);
      }
    } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
  },

  async _deleteCourse(id, name) {
    UI.confirmDelete({ itemLabel: 'course', name, onConfirm: async () => {
      try {
        await apiJson('/api/admin/courses/' + id, { method: 'DELETE' });
        UI.toast('Course permanently deleted');
        if (Departments._selectedDept) {
          await Departments._loadCourses(Departments._selectedDept._id || Departments._selectedDept.id, Departments._selectedDept.name);
        }
      } catch (e) { UI.toast(e.message || 'Delete failed', 'error'); }
    }});
  },
};

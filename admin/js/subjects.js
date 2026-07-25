// js/subjects.js — Subjects: dept → course → subjects (sem-wise)
const Subjects = {
  _depts: [],
  _courses: [],
  _selectedDept: null,
  _selectedCourse: null,
  _activeSem: 'all',

  async load() {
    UI.setNav('subjects');
    Subjects._selectedDept = null;
    Subjects._selectedCourse = null;
    document.getElementById('subj-dept-view').classList.remove('hidden');
    document.getElementById('subj-course-view').classList.add('hidden');
    document.getElementById('subj-list-view').classList.add('hidden');
    await Subjects._loadDepts();
  },

  async _loadDepts() {
    const grid = document.getElementById('subj-dept-boxes');
    grid.innerHTML = Array(4).fill('<div class="dept-box sk" style="height:120px"></div>').join('');
    try {
      const d = await apiJson('/api/admin/departments');
      Subjects._depts = d.data || d.departments || [];
      const icons = { 'fa-laptop-code': '💻', 'fa-atom': '⚛️', 'fa-flask': '🧪', 'fa-calculator': '🔢', 'fa-bolt': '⚡', 'fa-cogs': '⚙️', 'fa-heartbeat': '❤️', 'fa-paint-brush': '🎨', 'fa-chart-line': '📈', 'fa-building': '🏛️' };
      if (!Subjects._depts.length) {
        grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No departments found.</div>';
        return;
      }
      grid.innerHTML = Subjects._depts.map(dept => `
        <div class="dept-box" onclick="Subjects.openDept('${dept._id || dept.id}')">
          <div class="dept-box-icon">${icons[dept.icon] || '🏛️'}</div>
          <div class="dept-box-name">${dept.name}</div>
          <div class="dept-box-code">${dept.code || ''}</div>
        </div>`).join('');
    } catch (e) {
      grid.innerHTML = `<div style="color:var(--red);padding:16px">Failed: ${e.message}</div>`;
    }
  },

  async openDept(deptId) {
    const dept = Subjects._depts.find(d => (d._id || d.id) === deptId);
    if (!dept) return;
    Subjects._selectedDept = dept;
    document.getElementById('subj-dept-view').classList.add('hidden');
    document.getElementById('subj-course-view').classList.remove('hidden');
    document.getElementById('subj-list-view').classList.add('hidden');
    document.getElementById('subj-course-dept-name').textContent = dept.name;
    const grid = document.getElementById('subj-course-boxes');
    grid.innerHTML = Array(3).fill('<div class="course-card sk" style="height:100px"></div>').join('');
    try {
      const d = await apiJson('/api/admin/courses?department=' + deptId);
      Subjects._courses = d.data || d.courses || [];
      if (!Subjects._courses.length) {
        grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No courses in this department. Add courses first.</div>';
        return;
      }
      grid.innerHTML = Subjects._courses.map(c => `
        <div class="course-card" onclick="Subjects.openCourse('${c._id || c.id}')">
          <div class="course-card-name">${c.name}</div>
          <span class="course-card-type">${c.type || 'UG'}</span>
          <div class="course-card-meta">⏱ ${c.duration || '—'}</div>
        </div>`).join('');
    } catch (e) {
      grid.innerHTML = `<div style="color:var(--red);padding:16px">${e.message}</div>`;
    }
  },

  async openCourse(courseId) {
    const course = Subjects._courses.find(c => (c._id || c.id) === courseId);
    if (!course) return;
    Subjects._selectedCourse = course;
    Subjects._activeSem = 'all';
    document.getElementById('subj-course-view').classList.add('hidden');
    document.getElementById('subj-list-view').classList.remove('hidden');
    document.getElementById('subj-list-course-name').textContent = course.name;
    document.getElementById('subj-list-dept-name').textContent = Subjects._selectedDept?.name || '';
    document.getElementById('subj-course-id').value = courseId;
    // Set dept in add-subject modal
    const deptEl = document.getElementById('subj-dept');
    if (deptEl) deptEl.value = Subjects._selectedDept?._id || '';
    await Subjects._loadSubjects(courseId, 'all');
  },

  async _loadSubjects(courseId, sem) {
    const tbody = document.getElementById('subj-tbody');
    tbody.innerHTML = `<tr><td colspan="6">${UI.sk(3, 38)}</td></tr>`;
    try {
      const q = `course=${courseId}${sem !== 'all' ? '&semester=' + sem : ''}`;
      const d = await apiJson('/api/admin/subjects?' + q);
      const list = d.data || d.subjects || [];
      document.getElementById('subj-count').textContent = `${list.length} subject${list.length !== 1 ? 's' : ''}`;
      tbody.innerHTML = list.length ? list.map((s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${s.name}</td>
          <td><span class="ctag">${s.code || '—'}</span></td>
          <td>${s.credits || '—'}</td>
          <td>Sem ${s.semester || '—'}</td>
          <td><span class="badge ${s.type === 'Theory' ? 'bw' : 'bg'}">${s.type || '—'}</span></td>
          <td>${s.teacher?.name || '—'}</td>
        </tr>`).join('')
        : `<tr><td colspan="7" class="empty">No subjects${sem !== 'all' ? ' in Semester ' + sem : ''} yet.</td></tr>`;
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
    }
  },

  setSem(sem) {
    Subjects._activeSem = sem;
    document.querySelectorAll('.sem-tab').forEach(t => t.classList.toggle('active', t.dataset.sem === String(sem)));
    if (Subjects._selectedCourse) Subjects._loadSubjects(Subjects._selectedCourse._id || Subjects._selectedCourse.id, sem);
  },

  backToCourses() {
    document.getElementById('subj-course-view').classList.remove('hidden');
    document.getElementById('subj-list-view').classList.add('hidden');
    Subjects._selectedCourse = null;
  },

  backToDepts() {
    document.getElementById('subj-dept-view').classList.remove('hidden');
    document.getElementById('subj-course-view').classList.add('hidden');
    document.getElementById('subj-list-view').classList.add('hidden');
    Subjects._selectedDept = null;
    Subjects._selectedCourse = null;
  },

  openAdd() {
    document.getElementById('subj-form').reset();
    document.getElementById('subj-id').value = '';
    if (Subjects._selectedCourse) {
      document.getElementById('subj-course-select').value = Subjects._selectedCourse._id || Subjects._selectedCourse.id;
    }
    UI.openModal('modal-subject');
  },

  async save() {
    const name = document.getElementById('subj-name').value.trim();
    const code = document.getElementById('subj-code').value.trim();
    const sem = document.getElementById('subj-sem').value;
    const credits = document.getElementById('subj-credits').value;
    const type = document.getElementById('subj-type').value;
    const courseId = document.getElementById('subj-course-select').value || (Subjects._selectedCourse?._id || Subjects._selectedCourse?.id);
    const deptId = Subjects._selectedDept?._id || Subjects._selectedDept?.id;
    if (!name || !code) { UI.toast('Name and code required', 'error'); return; }
    try {
      await apiJson('/api/admin/subjects', { method: 'POST', body: JSON.stringify({ name, code, department: deptId, course: courseId, semester: parseInt(sem) || 1, credits: parseInt(credits) || undefined, type }) });
      UI.toast('Subject added');
      UI.closeAll();
      if (Subjects._selectedCourse) await Subjects._loadSubjects(Subjects._selectedCourse._id || Subjects._selectedCourse.id, Subjects._activeSem);
    } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
  },

  async del(id, name) {
    UI.confirmDelete({ itemLabel: 'subject', name, onConfirm: async () => {
      try {
        await apiJson('/api/admin/subjects/' + id, { method: 'DELETE' });
        UI.toast('Permanently deleted');
        if (Subjects._selectedCourse) await Subjects._loadSubjects(Subjects._selectedCourse._id || Subjects._selectedCourse.id, Subjects._activeSem);
      } catch (e) { UI.toast(e.message || 'Failed', 'error'); }
    }});
  },
};

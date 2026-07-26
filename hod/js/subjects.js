// hod/js/subjects.js — Subjects management (spec item 4)
//
// Previously subjects were Admin-owned and HOD could only *select* from a
// list Admin built. Now the HOD/Co-HOD manages their own department's
// subjects directly — the same way Admin used to appoint subjects to a
// department/course, HOD/Co-HOD does it for their own department/course/sem.
// Admin's Subjects page is now read-only (see admin/js/subjects.js).

let subjFilterCourse = '';
let subjFilterSem = '';
let _subjEditingId = null;

async function loadSubjectsSection() {
  await refreshSubjects();
  if (!subjFilterCourse && HOD_COURSES.length) subjFilterCourse = HOD_COURSES[0];
  renderSubjectsPage();
}

function renderSubjectsPage() {
  const el = document.getElementById('subjectsContent');
  if (!el) return;
  const courseTabs = HOD_COURSES.map(c => `<button class="tab-btn ${c === subjFilterCourse ? 'active' : ''}" onclick="setSubjCourse('${_esc(c)}')">${_html(c)}</button>`).join('');
  const semTabs = Array.from({ length: SEM_COUNT || 6 }, (_, i) => i + 1)
    .map(s => `<button class="tab-btn ${String(s) === String(subjFilterSem) ? 'active' : ''}" onclick="setSubjSem(${s})">Sem ${s}</button>`).join('');

  const list = (window._subjectsList || []).filter(s => {
    const course = s.course;
    const sem = String(s.semester || s.sem || 1);
    return course === subjFilterCourse && (!subjFilterSem || sem === String(subjFilterSem));
  });

  el.innerHTML = `
    <div class="subject-manager">
      <div class="subject-filter-card">
        <div>
          <div class="subject-panel-title">Subjects</div>
          <div class="subject-panel-subtitle">Manage department subjects by course and semester.</div>
        </div>
        <div class="subject-filter-group">${courseTabs || '<span style="color:var(--text3)">No courses in your department yet — ask Admin to add one.</span>'}</div>
        <div class="subject-filter-group">${semTabs}</div>
      </div>
      <div class="subject-toolbar">
        <div class="subject-count">${list.length} subject${list.length !== 1 ? 's' : ''}${subjFilterCourse ? ` in ${_html(subjFilterCourse)}` : ''}${subjFilterSem ? ` Sem ${_html(subjFilterSem)}` : ''}</div>
        <button class="btn btn-primary btn-sm" onclick="openSubjectModal()" ${subjFilterCourse && subjFilterSem ? '' : 'disabled'}>＋ Add Subject</button>
      </div>
      <div class="subject-grid">
        ${list.length ? list.map(s => `
          <div class="subject-card">
            <div class="subject-card-main">
              <div class="subject-code">${_html(s.code || 'No code')}</div>
              <div class="subject-name">${_html(s.name)}</div>
              <div class="subject-meta">
                <span>${_html(s.type || 'Subject')}</span>
                <span>${_html(s.teacher?.name || 'Unassigned')}</span>
              </div>
            </div>
            <div class="subject-card-actions">
              <button class="ibtn" onclick="openSubjectModal('${s._id || s.id}')" title="Edit subject">✎</button>
              <button class="ibtn del" onclick="deleteSubject('${s._id || s.id}','${_esc(s.name)}')" title="Delete subject">🗑</button>
            </div>
          </div>`).join('') : `<div class="subject-empty">No subjects yet for ${_html(subjFilterCourse || '—')} Sem ${_html(subjFilterSem || '—')}.</div>`}
      </div>
    </div>
    `;
}

function setSubjCourse(c) { subjFilterCourse = c; subjFilterSem = ''; renderSubjectsPage(); }
function setSubjSem(s) { subjFilterSem = s; renderSubjectsPage(); }

function openSubjectModal(id) {
  _subjEditingId = id || null;
  const existing = id ? (window._subjectsList || []).find(s => String(s._id || s.id) === String(id)) : null;
  const teacherOptions = (allTeachers || []).filter(t => t.course === subjFilterCourse)
    .map(t => `<option value="${t.id || t._id}" ${existing?.teacher?._id === t.id ? 'selected' : ''}>${_html(t.name)}</option>`).join('');
  const html = `
    <div class="modal-overlay open" id="subjModalOverlay" onclick="if(event.target===this)closeSubjectModal()">
      <div class="modal-card" style="max-width:420px">
        <div class="modal-header"><span>${existing ? 'Edit' : 'Add'} Subject — ${_html(subjFilterCourse)} Sem ${_html(subjFilterSem)}</span><button onclick="closeSubjectModal()">✕</button></div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;padding:20px">
          <div class="form-group"><label>Subject Name</label><input type="text" id="subjName" value="${_html(existing?.name || '')}"></div>
          <div class="form-group"><label>Code (optional)</label><input type="text" id="subjCode" value="${_html(existing?.code || '')}"></div>
          <div class="form-group"><label>Type</label><select id="subjType"><option ${(existing?.type||'Theory')==='Theory'?'selected':''}>Theory</option><option ${existing?.type==='Practical'?'selected':''}>Practical</option></select></div>
          <div class="form-group"><label>Teacher (optional)</label><select id="subjTeacher"><option value="">-- Unassigned --</option>${teacherOptions}</select></div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" onclick="closeSubjectModal()">Cancel</button>
            <button class="btn btn-primary" onclick="saveSubject()">${existing ? 'Save' : 'Add'}</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
function closeSubjectModal() { document.getElementById('subjModalOverlay')?.remove(); _subjEditingId = null; }

async function saveSubject() {
  const name = document.getElementById('subjName').value.trim();
  if (!name) { showToast('Subject name is required.', true); return; }
  const body = {
    name,
    code: document.getElementById('subjCode').value.trim(),
    type: document.getElementById('subjType').value,
    teacher: document.getElementById('subjTeacher').value || undefined,
    course: subjFilterCourse,
    semester: Number(subjFilterSem),
  };
  try {
    if (_subjEditingId) {
      await apiJson('/api/hod/subjects/' + _subjEditingId, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Subject updated.');
    } else {
      await apiJson('/api/hod/subjects', { method: 'POST', body: JSON.stringify(body) });
      showToast('Subject added.');
    }
    closeSubjectModal();
    await loadSubjectsSection();
  } catch (e) {
    showToast(e.message || 'Failed', true);
  }
}

function deleteSubject(id, name) {
  confirmDeleteModal({ itemLabel: 'subject', name, onConfirm: async () => {
    try {
      await apiJson('/api/hod/subjects/' + id, { method: 'DELETE' });
      showToast('Subject permanently deleted.');
      await loadSubjectsSection();
    } catch (e) { showToast(e.message || 'Failed', true); }
  }});
}

// Note: _html() and _esc() are already defined globally in students.js
// (loaded earlier) — reused here rather than redefined.

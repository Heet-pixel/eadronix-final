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
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">${courseTabs || '<span style="color:var(--text3)">No courses in your department yet — ask Admin to add one.</span>'}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${semTabs}</div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="btn btn-primary btn-sm" onclick="openSubjectModal()" ${subjFilterCourse && subjFilterSem ? '' : 'disabled'}>＋ Add Subject</button>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Code</th><th>Credits</th><th>Type</th><th>Teacher</th><th></th></tr></thead>
        <tbody>
          ${list.length ? list.map(s => `
            <tr>
              <td>${_html(s.name)}</td>
              <td>${_html(s.code || '—')}</td>
              <td>${s.credits ?? '—'}</td>
              <td>${_html(s.type || '—')}</td>
              <td>${_html(s.teacher?.name || '—')}</td>
              <td style="white-space:nowrap">
                <button class="ibtn" onclick="openSubjectModal('${s._id || s.id}')">✎</button>
                <button class="ibtn del" onclick="deleteSubject('${s._id || s.id}','${_esc(s.name)}')">🗑</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">No subjects yet for ${_html(subjFilterCourse || '—')} Sem ${_html(subjFilterSem || '—')}.</td></tr>`}
        </tbody>
      </table>
    </div>`;
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
          <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>Credits</label><input type="number" id="subjCredits" min="1" max="10" value="${existing?.credits || 3}"></div>
            <div><label>Type</label><select id="subjType"><option ${(existing?.type||'Theory')==='Theory'?'selected':''}>Theory</option><option ${existing?.type==='Practical'?'selected':''}>Practical</option></select></div>
          </div>
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
    credits: Number(document.getElementById('subjCredits').value) || undefined,
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

// teacher/js/syllabus.js — Syllabus: Add entries, upload file reference, render list
// Subjects come from the teacher's assigned subjects (set by app.js from the API).
// A saved entry with an attachment also becomes visible in the student's
// Notices feed (server-side, see routes/teacher.routes.js POST /syllabus).

function populateSylSubjects() {
  const c   = document.getElementById('sylCourse').value;
  const s   = document.getElementById('sylSem').value;
  const sel = document.getElementById('sylSubject');
  sel.innerHTML = '<option value="">— Select Subject —</option>';
  if (!c || !s) return;

  // Filter teacher's assigned subjects for the selected course+semester
  const myS = currentTeacher.assignedSubjects.filter(sub => {
    if (typeof sub === 'object') {
      if (sub.isAssignedToMe === false) return false; // not this teacher's subject
      const course = sub.course || sub.courseName;
      const sem    = sub.semester ?? sub.sem;
      return course === c && parseInt(sem) === parseInt(s);
    }
    return true; // plain strings — show all, backend enforces access
  }).map(sub => (typeof sub === 'string' ? sub : sub.name || sub));

  myS.forEach(sub => { sel.innerHTML += `<option>${sub}</option>`; });
  if (!myS.length) sel.innerHTML = '<option value="">No assigned subjects here</option>';
}

function showSylFile(input) {
  const f = input.files[0];
  if (!f) return;
  document.getElementById('sylFilePrev').innerHTML = `
    <div style="background:var(--green-bg);border:1px solid var(--green-br);border-radius:9px;padding:8px 12px;font-size:12px;color:var(--green);font-weight:700">
      📄 ${f.name} (${(f.size / 1024).toFixed(1)} KB)
    </div>`;
}

async function uploadSyllabus() {
  const c     = document.getElementById('sylCourse').value;
  const s     = document.getElementById('sylSem').value;
  const sub   = document.getElementById('sylSubject').value;
  const topic = document.getElementById('sylTopic').value.trim();
  if (!c || !s || !sub || !topic) { showToast('Please fill all required fields', 'error'); return; }

  const fileInput = document.getElementById('sylFile');
  const file = fileInput.files && fileInput.files[0];
  let attachment, attachmentName;
  if (file) {
    if (file.size > 5 * 1024 * 1024) { showToast('Attachment is too large (max 5MB).', 'error'); return; }
    try {
      attachment = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      attachmentName = file.name;
    } catch (e) { showToast(e.message, 'error'); return; }
  }

  const entry = {
    course:    c,
    semester:  s,
    subject:   sub,
    topic,
    date:      document.getElementById('sylDate').value,
    desc:      document.getElementById('sylDesc').value.trim(),
    duration:  document.getElementById('sylDuration').value,
    method:    document.getElementById('sylMethod').value,
    attachment, attachmentName,
  };

  try {
    const res = await TAPI.saveSyllabus(entry);
    if (!res.success) { showToast(res.message || 'Failed to save', 'error'); return; }
    // Use the server-returned entry if available, otherwise use local entry
    syllabusList.unshift(res.entry || res.syllabus || { ...entry, id: res.id || Date.now() });
  } catch (_) {
    showToast('Network error. Please try again.', 'error'); return;
  }

  document.getElementById('sylFilePrev').innerHTML = '';
  fileInput.value = '';
  renderSylList();
  document.getElementById('sylTopic').value = '';
  document.getElementById('sylDesc').value  = '';
  loadDashboard();
  showToast(attachment ? 'Saved — students in this class can see it in Notices.' : 'Syllabus entry saved! 📚');
}

function renderSylList() {
  document.getElementById('sylCount').textContent = syllabusList.length + ' entr' + (syllabusList.length === 1 ? 'y' : 'ies');
  if (!syllabusList.length) {
    document.getElementById('sylList').innerHTML =
      '<div class="empty-state"><div class="e-icon">📄</div><div class="e-txt">No entries yet</div></div>';
    return;
  }
  document.getElementById('sylList').innerHTML = syllabusList.map(e => {
    const subjectLabel = (e.subject && typeof e.subject === 'object' && e.subject.name) ? e.subject.name : (e.subjectName || (typeof e.subject === 'string' ? e.subject : '') || '');
    return `
    <div class="syl-item">
      <div class="syl-dot"></div>
      <div style="flex:1;min-width:0">
        <div class="syl-topic">${e.topic}</div>
        <div class="syl-meta">${subjectLabel} · ${UI.fmt(e.date)} · ${e.duration} min · ${e.method}</div>
        <div class="syl-tags">
          <span class="badge bg-purple">${e.course}</span>
          <span class="badge bg-blue">Sem ${e.semester || e.sem}</span>
        </div>
        ${e.desc ? `<div style="font-size:11px;color:var(--muted);margin-top:6px;font-weight:600">${e.desc}</div>` : ''}
        ${e.attachment ? `<div style="margin-top:6px"><a href="${e.attachment}" target="_blank" rel="noopener" style="font-size:11px;margin-right:10px">👁 View</a><a href="${e.attachment}" download="${e.attachmentName || 'Syllabus.pdf'}" style="font-size:11px">⬇ ${e.attachmentName || 'Download'}</a></div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function fixSylLayout() {
  const el = document.querySelector('.syl-layout');
  if (!el) return;
  el.style.gridTemplateColumns = window.innerWidth < 900 ? '1fr' : '1fr 1fr';
}

// teacher/js/notices.js
// - Announcements: read-only feed of what HOD/Co-HOD/Admin have posted.
// - "Send Notice": lets the teacher push a notice straight to students in
//   one of their own assigned classes (goes into that class's Notices feed).

const Announcements = {
  async load() {
    const el = document.getElementById('announcementsList');
    if (!el) return;
    el.innerHTML = UI.sk(3, 80);
    try {
      const d = await TAPI.getAnnouncements();
      if (!d.success) { el.innerHTML = '<p class="empty">Failed to load.</p>'; return; }
      const notices = d.announcements || d.data?.announcements || [];
      el.innerHTML = notices.length
        ? notices.map(n => `
            <div class="notice-card">
              <div class="nc-title">${n.title}</div>
              <div class="nc-body">${n.body || n.message || ''}</div>
              ${n.attachment ? `<div style="margin-top:6px"><a href="${n.attachment}" target="_blank" rel="noopener" style="margin-right:10px">👁 View</a><a href="${n.attachment}" download="${n.attachmentName || 'Announcement.pdf'}">⬇ Download</a></div>` : ''}
              <div class="nc-meta">Posted ${UI.fmt(n.createdAt)}
                ${n.author?.name ? ' · by ' + n.author.name : ''}
              </div>
            </div>`).join('')
        : '<p class="empty">No announcements yet.</p>';
    } catch (_) {
      el.innerHTML = '<p class="empty">Error loading announcements.</p>';
    }
  },
};

// ── Send Notice to My Students ──────────────────────────────────────────
function showTnFile(input) {
  const prev = document.getElementById('tnFilePrev');
  if (!prev) return;
  prev.textContent = input.files[0] ? '📎 ' + input.files[0].name : '';
}

async function sendTeacherNotice() {
  const course = document.getElementById('tnCourse')?.value;
  const semester = document.getElementById('tnSem')?.value;
  const title = document.getElementById('tnTitle')?.value.trim();
  const body = document.getElementById('tnBody')?.value.trim();
  if (!course || !semester) { UI.toast?.('Select the course and semester first.', 'error') ?? alert('Select the course and semester first.'); return; }
  if (!title) { UI.toast?.('Title is required.', 'error') ?? alert('Title is required.'); return; }

  let attachment, attachmentName;
  const fileEl = document.getElementById('tnFile');
  const file = fileEl && fileEl.files[0];
  if (file) {
    if (file.size > 5 * 1024 * 1024) { UI.toast?.('File is too large (max 5MB).', 'error') ?? alert('File is too large (max 5MB).'); return; }
    try {
      attachment = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      attachmentName = file.name;
    } catch (e) { UI.toast?.(e.message, 'error') ?? alert(e.message); return; }
  }

  try {
    const d = await TAPI.sendNotice({ course, semester, title, body, attachment, attachmentName });
    if (!d.success) throw new Error(d.message || 'Failed to send notice.');
    UI.toast?.('Notice sent to your students.', 'success') ?? alert('Notice sent to your students.');
    document.getElementById('tnTitle').value = '';
    document.getElementById('tnBody').value = '';
    if (fileEl) fileEl.value = '';
    document.getElementById('tnFilePrev').textContent = '';
  } catch (e) {
    UI.toast?.(e.message, 'error') ?? alert(e.message);
  }
}

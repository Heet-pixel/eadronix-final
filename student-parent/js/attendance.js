// student/js/attendance.js
// Student attendance summary and per-subject lecture detail.

function _attEscHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const Attendance = {
  _data: [],

  async load() {
    _el('att-chart').innerHTML = UI.skeleton(1, 220);
    _el('att-content').innerHTML = UI.skeleton(4, 110);
    try {
      const d = await API.student.attendance();
      if (!d.success) throw new Error(d.message || 'Failed to load attendance');
      this._data = this._normalize(d);
      this._render();
    } catch (err) {
      _el('att-content').innerHTML = UI.error(err.message);
    }
  },

  _normalize(d) {
    const raw = d.data || d.subjects || d.summary || [];
    const list = Array.isArray(raw) ? raw : Object.values(raw || {});
    return list.map(item => {
      const subject = item.subject && typeof item.subject === 'object'
        ? item.subject
        : {
            _id: item.subjectId || item.subject || item.name || item.subjectName,
            name: item.subjectName || item.name || item.subject || 'Subject',
            code: item.code || ''
          };
      const sessions = item.sessions || item.records || item.lectures || [];
      const present = Number(item.present || 0);
      const absent = Number(item.absent || 0);
      const total = Number(item.total || present + absent + Number(item.leave || 0));
      return {
        ...item,
        subject,
        sessions: Array.isArray(sessions) ? sessions : [],
        present,
        absent,
        total,
        percentage: item.percentage ?? (total > 0 ? Math.round((present / total) * 100) : 0)
      };
    });
  },

  _render() {
    const list = this._data;
    AttendanceChart.render('att-chart', list, false);
    if (!list.length) {
      _el('att-content').innerHTML = UI.empty('Attendance', 'No attendance recorded', 'Your teachers have not marked attendance yet.');
      return;
    }

    const totalPresent = list.reduce((s, x) => s + (x.present || 0), 0);
    const totalClasses = list.reduce((s, x) => s + (x.total || 0), 0);
    const overall = totalClasses > 0 ? Math.round(totalPresent / totalClasses * 100) : 0;

    _el('att-content').innerHTML = `
      <div class="student-att-shell">
        <div class="att-mobile-top">
          <span>Overall :</span>
          <strong>${overall}% (${totalPresent}/${totalClasses})</strong>
          <select aria-label="Attendance filter"><option>Overall</option></select>
        </div>
        <div class="att-table-head">
          <span>Subject</span><span>%</span><span>Lectures<br>Attended</span>
        </div>
        <div class="att-subject-list">
          ${list.map((s, idx) => this._subjectRow(s, idx)).join('')}
        </div>
      </div>`;
  },

  _subjectRow(s, idx) {
    const pct = s.percentage ?? 0;
    const subject = s.subject || {};
    const name = subject.name || 'Subject';
    const code = subject.code ? ` (${subject.code})` : '';
    const issue = pct === 0 && s.total === 0;
    return `
      <button class="att-subject-row" type="button" onclick="Attendance._openSubject(${idx})">
        <span class="att-subject-name">${name}${code}</span>
        <span class="att-subject-pct">${pct}%</span>
        <span class="att-subject-count">${s.present || 0}/${s.total || 0}</span>
        <span class="att-subject-arrow">${issue ? '<b class="att-x">x</b>' : '>'}</span>
      </button>`;
  },

  _openSubject(idx) {
    const item = this._data[idx];
    if (!item) return;
    const subject = item.subject || {};
    const sessions = [...(item.sessions || [])].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    _el('att-content').innerHTML = `
      <div class="att-detail-screen">
        <div class="att-detail-toolbar">
          <button type="button" onclick="Attendance._back()">Back</button>
          <strong>${subject.name || 'Subject'}</strong>
        </div>
        <div class="att-detail-list">
          ${sessions.length ? sessions.map((r, i) => this._sessionCard(r, subject, i)).join('') : this._emptySessionCard(subject)}
        </div>
      </div>`;
  },

  _sessionCard(r, subject, i) {
    const status = (r.status || 'present').toLowerCase();
    const present = status === 'present';
    const lectureDate = r.date ? UI.date(r.date) : '—';
    const start = r.time || r.startTime || r.session || `Lecture ${i + 1}`;
    const uploadedAt = r.uploadedAt
      ? new Date(r.uploadedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
      : null;
    return `
      <div class="att-session-card">
        ${r.isProxy ? `<div class="att-proxy-badge">🔁 Proxy Lecture</div>` : ''}
        <div class="att-session-top">
          <span class="att-clock">Clock</span>
          <strong>${lectureDate}${start ? ' · ' + start : ''}</strong>
          <span class="att-mode">Mode:<br><b>${r.mode || r.type || 'Offline'}</b></span>
          <span class="att-dot ${present ? 'ok' : 'bad'}"></span>
          <span class="att-flag">${present ? 'Present' : (status === 'leave' ? 'Leave' : 'Absent')}</span>
        </div>
        <div class="att-session-sub">${subject.name || r.subjectName || 'Subject'}${r.division ? ' · ' + r.division : ''}</div>
        ${r.topic ? `<div class="att-session-topic">Topic: ${_attEscHtml(r.topic)}</div>` : ''}
        <div class="att-session-teacher">${r.teacher?.name || r.teacherName || 'Teacher'}</div>
        ${uploadedAt ? `<div class="att-session-uploaded" style="font-size:11px;color:var(--clr-text3);margin-top:6px;text-align:left">Uploaded ${uploadedAt}</div>` : ''}
      </div>`;
  },

  _emptySessionCard(subject) {
    return `
      <div class="att-session-card">
        <div class="att-session-sub">${subject.name || 'Subject'}</div>
        <div class="att-session-teacher">No lecture history available yet.</div>
      </div>`;
  },

  _back() {
    this._render();
  }
};

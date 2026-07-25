// teacher/js/attendance.js — Attendance: Stepper, Subject chips, Seat grid, Save
// Students and subjects are fetched live from the backend; no mock data.

function updateStepper(step) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('step' + i);
    el.classList.remove('active', 'done');
    if (i < step)       el.classList.add('done');
    else if (i === step) el.classList.add('active');
  }
}

function onAttChange() {
  updateSemOptions('attCourse', 'attSem', false);
  const c = document.getElementById('attCourse').value;
  const s = parseInt(document.getElementById('attSem').value);
  currentAttCourse = c; currentAttSem = s;
  if (!c || !s) {
    document.getElementById('attSubjSec').style.display     = 'none';
    document.getElementById('attGridSec').style.display     = 'none';
    document.getElementById('attPlaceholder').style.display = 'block';
    selectedSub = ''; updateStepper(1); return;
  }
  document.getElementById('attPlaceholder').style.display = 'none';
  document.getElementById('attSubjSec').style.display     = 'block';
  document.getElementById('attGridSec').style.display     = 'none';
  selectedSub = '';
  renderSubjChips(c, s);
  updateStepper(2);
}

function renderSubjChips(c, s) {
  // Filter the teacher's assigned subjects that match the selected course & semester
  const myS = currentTeacher.assignedSubjects.filter(sub => {
    if (typeof sub === 'object' && sub.isAssignedToMe === false) return false; // not this teacher's subject
    const meta = sub.course || sub.courseName;
    const sem  = sub.semester ?? sub.sem;
    if (meta && sem) return meta === c && parseInt(sem) === s;
    // If subjects are plain strings (no metadata), show all assigned — backend should filter
    return true;
  }).map(sub => (typeof sub === 'string' ? sub : sub.name || sub));

  if (!myS.length) {
    document.getElementById('attSubjChips').innerHTML =
      '<p style="color:var(--muted);font-size:13px;font-weight:600">No assigned subjects for this class.</p>';
    return;
  }
  document.getElementById('attSubjChips').innerHTML = myS.map(sub =>
    `<div class="s-chip${selectedSub === sub ? ' sel' : ''}" onclick="selectSubject(decodeURIComponent('${encodeURIComponent(sub)}'))">${sub}</div>`
  ).join('');
}

function selectSubject(sub) {
  selectedSub = sub;
  renderSubjChips(currentAttCourse, currentAttSem);
  buildGrid();
  document.getElementById('attGridSec').style.display  = 'block';
  document.getElementById('attConfirm').style.display  = 'none';
  updateStepper(3);
  setTimeout(() => { document.getElementById('attGridSec').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
}

renderSubjChips = function renderSubjectSelector(c, s) {
  const isProxy = !!document.getElementById('attProxy')?.checked;
  const myS = isProxy ? allSubjectsForClass(c, s) : subjectsForClass(c, s);
  if (!myS.length) {
    // Spec item 5: subject must NEVER be manually typed — it must come from the
    // Admin-created master subject list. If nothing is assigned to this class yet,
    // block attendance entry instead of allowing free text.
    document.getElementById('attSubjChips').innerHTML =
      `<p style="color:var(--red);font-size:13px;font-weight:600;margin-top:10px">
        No subject is assigned to ${htmlEscape(c)} Sem ${s} yet. Ask your HOD/Admin to add it to the
        timetable before attendance can be marked for this class.
      </p>`;
    selectedSub = '';
    return;
  }
  document.getElementById('attSubjChips').innerHTML =
    `<div class="form-row" style="margin:0">
      <div class="form-group" style="margin:0;max-width:520px">
        <label>${isProxy ? 'Proxy Subject' : 'Subject'}</label>
        <select id="attSubjectSelect" onchange="selectSubject(this.value)">
          <option value="">-- Select Subject --</option>
          ${myS.map(sub => `<option value="${htmlEscape(sub)}" ${selectedSub === sub ? 'selected' : ''}>${htmlEscape(sub)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="subj-chip-wrap" style="margin-top:12px">
      ${myS.map(sub => `<div class="s-chip${selectedSub === sub ? ' sel' : ''}" onclick="selectSubject(decodeURIComponent('${encodeURIComponent(sub)}'))">${htmlEscape(sub)}</div>`).join('')}
    </div>`;
};

function allSubjectsForClass(course, sem) {
  const wantedCourse = normalizeText(course);
  const wantedSem = Number(sem);
  const names = [];
  (currentTeacher.assignedSubjects || []).forEach(sub => {
    if (typeof sub === 'string') {
      if (sub.trim()) names.push(sub.trim());
      return;
    }
    const subCourse = normalizeText(sub.course || sub.courseName || '');
    const subSem = Number(sub.semester ?? sub.sem ?? 0);
    const hasClassMeta = Boolean(subCourse || subSem);
    const matchesClass = !hasClassMeta || ((!subCourse || subCourse === wantedCourse) && (!subSem || subSem === wantedSem));
    if (matchesClass && sub.name) names.push(sub.name);
  });
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

function subjectsForClass(course, sem) {
  const wantedCourse = normalizeText(course);
  const wantedSem = Number(sem);
  const names = [];
  (currentTeacher.assignedSubjects || []).forEach(sub => {
    if (typeof sub === 'string') {
      if (sub.trim()) names.push(sub.trim());
      return;
    }
    const subCourse = normalizeText(sub.course || sub.courseName || '');
    const subSem = Number(sub.semester ?? sub.sem ?? 0);
    const hasClassMeta = Boolean(subCourse || subSem);
    const matchesClass = !hasClassMeta || ((!subCourse || subCourse === wantedCourse) && (!subSem || subSem === wantedSem));
    if (matchesClass && sub.name) names.push(sub.name);
  });
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

// Fetch students for the selected class from the API, then render the seat grid
async function buildGrid() {
  document.getElementById('attGrid').innerHTML = '<div class="sk" style="height:80px;border-radius:8px"></div>';
  try {
    const q = new URLSearchParams({ course: currentAttCourse, semester: currentAttSem }).toString();
    const d = await salFetch('GET', '/teacher/students?' + q);
    const students = d.success ? (d.students || d.data || []) : [];
    gridSeats = students.map((st, i) => ({
      num: i + 1,
      status: 'present',
      student: { id: st._id || st.id, name: st.name, roll: st.rollNumber || st.roll || '' },
    }));
    renderGrid();
  } catch (_) {
    document.getElementById('attGrid').innerHTML =
      '<p style="color:var(--red);font-size:13px;font-weight:600;text-align:center">Failed to load students. Please try again.</p>';
  }
}

function renderGrid() {
  const p   = gridSeats.filter(s => s.status === 'present').length;
  const a   = gridSeats.filter(s => s.status === 'absent').length;
  const tot = gridSeats.length;
  const pct = tot > 0 ? Math.round(p / tot * 100) : 0;
  document.getElementById('acTotal').textContent   = tot;
  document.getElementById('acPresent').textContent = p;
  document.getElementById('acAbsent').textContent  = a;
  document.getElementById('acPct').textContent     = pct + '%';
  document.getElementById('attGrid').innerHTML = gridSeats.map((seat, i) => {
    const fn = seat.student.name.split(' ')[0];
    return `<div class="seat${seat.status === 'absent' ? ' absent' : ''}" title="${seat.student.name} (${seat.student.roll})" onclick="seatToggle(${i})">
      <span>${seat.num}</span><span class="seat-name">${fn}</span>
    </div>`;
  }).join('');
}

function seatToggle(i) { gridSeats[i].status = gridSeats[i].status === 'present' ? 'absent' : 'present'; renderGrid(); }
function markAll(st)    { gridSeats.forEach(s => s.status = st); renderGrid(); }

function prepareConfirm() {
  const p   = gridSeats.filter(s => s.status === 'present').length;
  const a   = gridSeats.filter(s => s.status === 'absent').length;
  const tot = gridSeats.length;
  const pct = tot > 0 ? Math.round(p / tot * 100) : 0;
  document.getElementById('confNums').innerHTML = `
    <div class="cn-item"><div class="cn-v" style="color:var(--accent)">${tot}</div><div class="cn-l">Total</div></div>
    <div class="cn-item"><div class="cn-v" style="color:var(--green)">${p}</div><div class="cn-l">Present</div></div>
    <div class="cn-item"><div class="cn-v" style="color:var(--red)">${a}</div><div class="cn-l">Absent</div></div>
    <div class="cn-item"><div class="cn-v" style="color:var(--accent)">${pct}%</div><div class="cn-l">% Pres.</div></div>`;
  document.getElementById('attConfirm').style.display = 'block';
  document.getElementById('attConfirm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  updateStepper(4);
}

async function submitAtt() {
  const c   = currentAttCourse, s = currentAttSem, sub = selectedSub;
  const dt  = document.getElementById('attDate').value;
  if (!c || !s || !sub) { showToast('Please select class & subject', 'error'); return; }

  const today = new Date().toISOString().split('T')[0];
  if (dt > today) {
    showToast('Attendance cannot be marked for a future date.', 'error');
    return;
  }

  const startTime = document.getElementById('attStart')?.value || '';
  const endTime    = document.getElementById('attEnd')?.value || '';

  if (startTime && endTime) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const durationInMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (durationInMinutes < 30) {
      showToast('A lecture must be at least 30 minutes long.', 'error');
      return;
    }
  }

  const time = startTime ? `${startTime}${endTime ? ' - ' + endTime : ''}` : '';
  const division = document.getElementById('attDivision')?.value.trim() || '';
  const topic = document.getElementById('attTopic')?.value.trim() || '';
  const isProxy = !!document.getElementById('attProxy')?.checked;

  const records = gridSeats.map(seat => ({
    studentId: seat.student.id,
    status:    seat.status,
    course:    c,
    semester:  s,
    subjectName: sub,
    date:      dt,
    type:      document.getElementById('attType').value,
    topic,
    isProxy,
  }));

  const payload = {
    course:    c,
    semester:  s,
    subject:   sub,
    date:      dt,
    time,
    division,
    type:      document.getElementById('attType').value,
    topic,
    isProxy,
    records,
  };

  try {
    const res = await TAPI.saveAttendance(payload);
    if (!res.success) { showToast(res.message || 'Failed to save attendance', 'error'); return; }
  } catch (_) {
    showToast('Network error. Please try again.', 'error'); return;
  }

  const p   = gridSeats.filter(s => s.status === 'present').length;
  const tot = gridSeats.length;

  // Update local log for dashboard counter
  attLogs.push({ course: c, sem: s, subject: sub, date: dt, present: p, total: tot });

  // Reset UI
  document.getElementById('attConfirm').style.display     = 'none';
  document.getElementById('attGridSec').style.display     = 'none';
  document.getElementById('attSubjSec').style.display     = 'none';
  document.getElementById('attPlaceholder').style.display = 'block';
  document.getElementById('attCourse').value = '';
  document.getElementById('attSem').value    = '';
  if (document.getElementById('attTopic')) document.getElementById('attTopic').value = '';
  if (document.getElementById('attProxy')) document.getElementById('attProxy').checked = false;
  selectedSub = ''; gridSeats = []; currentAttCourse = ''; currentAttSem = 0;
  loadDashboard();
  updateStepper(1);
  showToast(`Saved! ${p}/${tot} present ✅`);
}

// ═══════════════════════════════════════════════════════════
// Attendance History (spec item 4) — list every lecture this teacher
// has submitted, view one, and edit it IN PLACE (no new lecture created).
// ═══════════════════════════════════════════════════════════
const AttHistory = {
  async open() {
    document.getElementById('attHistoryOverlay').classList.add('open');
    const body = document.getElementById('attHistoryBody');
    body.innerHTML = 'Loading…';
    try {
      const d = await TAPI.getAttHistory();
      if (!d.success) throw new Error(d.message || 'Failed to load history');
      this._renderList(d.sessions || []);
    } catch (e) {
      body.innerHTML = `<p style="color:var(--red)">${e.message}</p>`;
    }
  },

  close() { document.getElementById('attHistoryOverlay').classList.remove('open'); },
  closeSession() { document.getElementById('attSessionOverlay').classList.remove('open'); },

  _renderList(sessions) {
    const body = document.getElementById('attHistoryBody');
    if (!sessions.length) {
      body.innerHTML = `<div class="empty-state" style="padding:32px 20px"><div class="e-icon">🕘</div><div class="e-txt">No attendance submitted yet</div></div>`;
      return;
    }
    body.innerHTML = sessions.map(s => `
      <div class="sched-card" style="cursor:pointer" onclick="AttHistory.openSession('${s.sessionKey}')">
        <div class="sched-time-badge">
          <div class="stb-time">${UI.fmt(s.date)}</div>
          <div class="stb-room">${s.time || s.type || ''}</div>
        </div>
        <div class="sched-info">
          <div class="sched-sub">${s.subjectName}</div>
          <div class="sched-meta">${s.course} · Sem ${s.semester}${s.division ? ' · ' + s.division : ''}</div>
          <span class="type-badge">✅ ${s.present} &nbsp; ❌ ${s.absent}</span>
        </div>
      </div>`).join('');
  },

  async openSession(sessionKey) {
    document.getElementById('attSessionOverlay').classList.add('open');
    const body = document.getElementById('attSessionBody');
    body.innerHTML = 'Loading…';
    try {
      const d = await TAPI.getAttSession(sessionKey);
      if (!d.success) throw new Error(d.message || 'Failed to load lecture');
      this._sessionKey = sessionKey;
      this._records = d.records;
      document.getElementById('attSessionTitle').textContent = `${d.meta.subjectName} — ${d.meta.course} Sem ${d.meta.semester}`;
      this._renderSession(d);
    } catch (e) {
      body.innerHTML = `<p style="color:var(--red)">${e.message}</p>`;
    }
  },

  _renderSession(d) {
    const body = document.getElementById('attSessionBody');
    const uploadedAt = d.meta.uploadedAt
      ? UI.fmtDateTime(d.meta.uploadedAt)
      : null;
    body.innerHTML = `
      <p style="color:var(--muted,#888);font-size:13px;margin-bottom:10px">
        ${d.meta.day} ${d.meta.time ? '· ' + d.meta.time : ''}${d.meta.division ? ' · Division ' + d.meta.division : ''} —
        editing here updates this same lecture, it does not create a new one.
      </p>
      <div id="attSessionSeats" style="display:flex;flex-direction:column;gap:6px">
        ${d.records.map((r, i) => `
          <div class="seat${r.status === 'absent' ? ' absent' : ''}" data-idx="${i}"
               style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 12px;cursor:pointer"
               title="Tap to toggle present/absent" onclick="AttHistory.toggleStatus(${i})">
            <span>${r.student?.name || 'Unknown'} <span style="opacity:.7;font-size:12px">${r.student?.roll || r.student?.rollNo || ''}</span></span>
            <b>${r.status === 'absent' ? 'Absent' : 'Present'}</b>
          </div>`).join('')}
      </div>
      <button class="btn btn-primary" style="margin-top:14px;width:100%" onclick="AttHistory.save()">Save Changes</button>
      ${uploadedAt ? `<div style="font-size:11px;color:var(--muted,#888);margin-top:10px;text-align:left">Lecture date: ${UI.fmt(d.meta.date)} · Uploaded ${uploadedAt}</div>` : ''}
    `;
  },

  toggleStatus(idx) {
    if (!this._records || !this._records[idx]) return;
    const r = this._records[idx];
    r.status = r.status === 'present' ? 'absent' : 'present';
    const el = document.querySelector(`#attSessionSeats .seat[data-idx="${idx}"]`);
    if (el) {
      el.classList.toggle('absent', r.status === 'absent');
      el.querySelector('b').textContent = r.status === 'absent' ? 'Absent' : 'Present';
    }
  },

  async save() {
    if (!this._sessionKey || !this._records) return;
    try {
      const payload = this._records.map(r => ({ student: r.student?._id || r.student, status: r.status }));
      const d = await TAPI.editAttSession(this._sessionKey, payload);
      if (!d.success) throw new Error(d.message || 'Failed to save');
      showToast(d.message || 'Attendance updated.');
      this.closeSession();
      this.open(); // refresh the list (counts change) 
    } catch (e) {
      showToast(e.message || 'Failed to save changes.', 'error');
    }
  },
};

function autoSetEndTime() {
    const start = document.getElementById("attStart").value;
    const end = document.getElementById("attEnd");
    const type = document.getElementById("attType").value;

    if (!start) return;

    const [hour, minute] = start.split(":").map(Number);

    const date = new Date();
    date.setHours(hour);
    date.setMinutes(minute);

    if (type === "Theory") {
        date.setHours(date.getHours() + 1);
    } else if (type === "Practical") {
        date.setHours(date.getHours() + 2);
    } else {
        return;
    }

    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");

    end.value = `${hh}:${mm}`;
}

document.getElementById("attStart").addEventListener("change", autoSetEndTime);
document.getElementById("attType").addEventListener("change", autoSetEndTime);

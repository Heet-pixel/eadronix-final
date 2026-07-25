// teacher/js/students.js — Students: Grid view, Student modal, Subject attendance detail
// All student and attendance data is fetched from the backend API. No mock data.

// Cache loaded for the current class view
let _stuCache = {}; // key: "course|sem" → { students, allSubj }

function onStuClassChange() {
  updateSemOptions('stuCourse', 'stuSem', false);
  stuFilterCourse = document.getElementById('stuCourse').value;
  stuFilterSem    = document.getElementById('stuSem').value;
  if (!stuFilterCourse || !stuFilterSem) {
    document.getElementById('stuPageContent').innerHTML = `
      <div class="students-placeholder">
        <div class="empty-state">
          <div class="e-icon">🎓</div>
          <div class="e-txt">Select Course & Semester</div>
          <div class="e-sub">Choose a class above to see all students</div>
        </div>
      </div>`;
    return;
  }
  renderStudentsGrid();
}

async function renderStudentsGrid() {
  const course = stuFilterCourse;
  const sem    = parseInt(stuFilterSem);
  const cacheKey = course + '|' + sem;

  document.getElementById('stuPageContent').innerHTML =
    '<div style="padding:20px">' + UI.sk(6, 72) + '</div>';

  try {
    const q = new URLSearchParams({ course, semester: sem }).toString();
    const d = await salFetch('GET', '/teacher/students?' + q);
    if (!d.success) throw new Error(d.message || 'Failed');

    const students = d.students || d.data || [];
    const allSubj  = d.subjects || d.allSubjects || [];
    const mySubj   = d.mySubjects || allSubj.filter(s => currentTeacher.assignedSubjects.includes(s));

    _stuCache[cacheKey] = { students, allSubj, mySubj };

    _renderGrid(course, sem, students, allSubj, mySubj, d.attendanceSummary || null);
  } catch (e) {
    document.getElementById('stuPageContent').innerHTML =
      `<div class="empty-state"><div class="e-icon">⚠️</div><div class="e-txt">Failed to load students</div><div class="e-sub">${e.message}</div></div>`;
  }
}

function _renderGrid(course, sem, students, allSubj, mySubj, attSummary) {
  const isCT = currentTeacher.isClassTeacher &&
               currentTeacher.classTeacherOf?.course === course &&
               currentTeacher.classTeacherOf?.sem    === sem;

  if (!students.length) {
    document.getElementById('stuPageContent').innerHTML =
      '<div class="empty-state"><div class="e-icon">📄</div><div class="e-txt">No students found</div></div>';
    return;
  }

  const ctHtml = isCT
    ? `<div class="ct-notice">🏠 <span>You are the <strong>Class Teacher</strong> of this class — you can view attendance for all subjects.</span></div>`
    : '';

  // Use backend-provided attendance summary if available, otherwise show bars without percentages
  let lowCount = 0;
  students.forEach(stu => {
    const stuId = stu._id || stu.id;
    const avg   = attSummary?.[stuId]?.avgPct ?? stu.avgAttendance ?? null;
    if (avg !== null && avg < 75) lowCount++;
  });

  const summaryHtml = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px">
      <div style="font-size:16px;font-weight:800">${course} · Sem ${sem}
        <span style="font-size:13px;color:var(--muted);font-weight:600">(${students.length} students)</span>
      </div>
      ${lowCount > 0
        ? `<span class="badge bg-red">⚠️ ${lowCount} below 75%</span>`
        : '<span class="badge bg-green">✅ All above 75%</span>'}
    </div>`;

  let gridHtml = '<div class="stu-grid">';
  students.forEach(stu => {
    const stuId  = stu._id || stu.id;
    const avgPct = attSummary?.[stuId]?.avgPct ?? stu.avgAttendance ?? null;
    const pctTxt = avgPct !== null ? avgPct + '%' : '—';
    const pc     = avgPct === null ? 'var(--muted)' : avgPct >= 75 ? 'var(--green)' : avgPct >= 60 ? 'var(--yellow)' : 'var(--red)';
    const initials = stu.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const c1 = SUBJ_COLORS[hashCode(stuId) % SUBJ_COLORS.length];
    const c2 = SUBJ_COLORS[(hashCode(stuId) + 3) % SUBJ_COLORS.length];
    gridHtml += `
      <div class="stu-card" onclick="openStuModal('${stuId}','${course}','${sem}')">
        ${avgPct !== null && avgPct < 75 ? '<div class="stu-badge-low">Low</div>' : ''}
        <div class="stu-av" style="background:linear-gradient(135deg,${c1},${c2})">${initials}</div>
        <div class="stu-name">${stu.name}</div>
        <div class="stu-roll">${stu.rollNumber || stu.roll || ''} · ${stu.gender || ''}</div>
        <div class="stu-pct" style="color:${pc}">${pctTxt}</div>
        <div class="stu-bar"><div class="stu-bar-fill" style="width:${avgPct ?? 0}%;background:${pc}"></div></div>
      </div>`;
  });
  gridHtml += '</div>';

  document.getElementById('stuPageContent').innerHTML = ctHtml + summaryHtml + gridHtml;
}

async function openStuModal(stuId, course, sem) {
  sem = parseInt(sem);
  document.getElementById('stuModalHd').innerHTML = UI.sk(1, 56);
  document.getElementById('stuModalBody').innerHTML = UI.sk(4, 60);
  document.getElementById('stuModal').classList.add('open');

  try {
    const d = await salFetch('GET', `/teacher/students/${stuId}/attendance?course=${course}&semester=${sem}`);
    if (!d.success) throw new Error(d.message || 'Failed');

    const stu     = d.student  || {};
    const subjects= d.subjects || [];
    const isCT    = currentTeacher.isClassTeacher &&
                    currentTeacher.classTeacherOf?.course === course &&
                    currentTeacher.classTeacherOf?.sem    === sem;

    const name     = stu.name || 'Student';
    const roll     = stu.rollNumber || stu.roll || '';
    const gender   = stu.gender || '';
    const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const c1 = SUBJ_COLORS[hashCode(stuId) % SUBJ_COLORS.length];
    const c2 = SUBJ_COLORS[(hashCode(stuId) + 3) % SUBJ_COLORS.length];

    document.getElementById('stuModalHd').innerHTML = `
      <div class="modal-hd-av" style="background:linear-gradient(135deg,${c1},${c2})">${initials}</div>
      <div style="flex:1">
        <div class="modal-hd-name">${name}${isCT ? '<span class="ct-badge">🏠 CT View</span>' : ''}</div>
        <div class="modal-hd-meta">${roll} · ${gender} · ${course} Sem ${sem}</div>
      </div>
      <button class="modal-close" onclick="closeStuModal()">✕</button>`;

    let overallPresent = 0, overallTotal = 0;
    let bodyHTML = '';

    if (!subjects.length) {
      bodyHTML = '<div class="empty-state"><div class="e-icon">📄</div><div class="e-txt">No attendance data available</div></div>';
    } else {
      subjects.forEach(s => { overallPresent += s.present || 0; overallTotal += s.total || 0; });
      const op  = overallTotal > 0 ? Math.round(overallPresent / overallTotal * 100) : 0;
      const oc  = op >= 75 ? 'var(--green)' : op >= 60 ? 'var(--yellow)' : 'var(--red)';
      bodyHTML = `
        <div class="overall-badge">
          <div>
            <div class="ob-label">Overall Attendance · ${subjects.length} subject${subjects.length !== 1 ? 's' : ''}</div>
            <div class="ob-sub">${overallPresent} present of ${overallTotal} total classes</div>
          </div>
          <div class="ob-pct" style="color:${oc}">${op}%</div>
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px">
          Tap any subject to see full attendance log
        </div>`;

      subjects.forEach((subj, i) => {
        const pct   = subj.total > 0 ? Math.round((subj.present / subj.total) * 100) : 0;
        const pc    = pct >= 75 ? 'var(--green)' : pct >= 60 ? 'var(--yellow)' : 'var(--red)';
        const pb    = pct >= 75 ? 'bg-green'     : pct >= 60 ? 'bg-yellow'     : 'bg-red';
        const isMine = currentTeacher.assignedSubjects.includes(subj.name);
        bodyHTML += `
          <div class="subj-row" onclick="openSubjDetail('${stuId}','${subj.name}','${name}')">
            <div class="sr-top">
              <div class="sr-name">
                <div class="sr-dot" style="background:${SUBJ_COLORS[i % SUBJ_COLORS.length]}"></div>
                ${subj.name}${!isMine ? '<span class="badge bg-yellow" style="font-size:9px;padding:2px 6px">Other</span>' : ''}
              </div>
              <span class="badge ${pb}">${pct}%</span>
            </div>
            <div class="sr-stats">
              <div class="sr-stat"><div class="sr-v" style="color:var(--green)">${subj.present}</div><div class="sr-l">Present</div></div>
              <div class="sr-stat"><div class="sr-v" style="color:var(--red)">${subj.absent ?? (subj.total - subj.present)}</div><div class="sr-l">Absent</div></div>
              <div class="sr-stat"><div class="sr-v" style="color:var(--muted)">${subj.total}</div><div class="sr-l">Total</div></div>
            </div>
            <div class="sr-bar"><div class="sr-bar-fill" style="width:${pct}%;background:${pc}"></div></div>
            <div style="font-size:11px;color:var(--accent);font-weight:700;margin-top:9px;text-align:right">View lecture log →</div>
          </div>`;
      });
    }
    document.getElementById('stuModalBody').innerHTML = bodyHTML;
  } catch (e) {
    document.getElementById('stuModalBody').innerHTML =
      `<div class="empty-state"><div class="e-icon">⚠️</div><div class="e-txt">Failed to load</div><div class="e-sub">${e.message}</div></div>`;
  }
}

async function openSubjDetail(stuId, subjectName, stuName) {
  document.getElementById('subjDetailHd').innerHTML = UI.sk(1, 48);
  document.getElementById('subjDetailBody').innerHTML = UI.sk(3, 60);
  document.getElementById('subjDetailModal').classList.add('open');

  try {
    const q = new URLSearchParams({ subject: subjectName }).toString();
    const d = await salFetch('GET', `/teacher/students/${stuId}/attendance/subject?${q}`);
    if (!d.success) throw new Error(d.message || 'Failed');

    const att = d.attendance || {};
    document.getElementById('subjDetailHd').innerHTML = `
      <div style="width:46px;height:46px;border-radius:13px;background:var(--accent-bg);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📋</div>
      <div style="flex:1;min-width:0">
        <div class="modal-hd-name" style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subjectName}</div>
        <div class="modal-hd-meta">${stuName}</div>
      </div>
      <button class="modal-close" onclick="closeSubjModal()">✕</button>`;

    document.getElementById('subjDetailBody').innerHTML = _buildSubjDetailBody(stuId, subjectName, stuName, 'all', att);
  } catch (e) {
    document.getElementById('subjDetailBody').innerHTML =
      `<div class="empty-state"><div class="e-icon">⚠️</div><div class="e-txt">Failed to load</div><div class="e-sub">${e.message}</div></div>`;
  }
}

function renderSubjBodyAndUpdate(stuId, subjectName, stuName, filterKey) {
  // Re-use cached lectures already in the DOM's dataset if available
  const cached = window._subjDetailCache;
  if (cached && cached.stuId === stuId && cached.subject === subjectName) {
    document.getElementById('subjDetailBody').innerHTML =
      _buildSubjDetailBody(stuId, subjectName, stuName, filterKey, cached.att);
  } else {
    // Re-fetch if no cache
    openSubjDetail(stuId, subjectName, stuName);
  }
}
function renderSubjBodyGlobal(stuId, subjectName, stuName, filterKey) { renderSubjBodyAndUpdate(stuId, subjectName, stuName, filterKey); }

function _buildSubjDetailBody(stuId, subjectName, stuName, filterKey, att) {
  // Cache for filter switching without re-fetching
  window._subjDetailCache = { stuId, subject: subjectName, att };

  const lectures = att.lectures || [];
  const filtered = filterLectures(lectures, filterKey);
  const fp   = filtered.filter(l => l.status === 'present').length;
  const fa   = filtered.filter(l => l.status === 'absent').length;
  const ft   = filtered.length;
  const fpct = ft > 0 ? Math.round(fp / ft * 100) : 0;
  const fpc  = fpct >= 75 ? 'var(--green)' : fpct >= 60 ? 'var(--yellow)' : 'var(--red)';
  const RANGES = [
    { key: 'all',    label: 'All Time'      },
    { key: 'month3', label: 'Last 3 Months' },
    { key: 'month2', label: 'Last 2 Months' },
    { key: 'month1', label: 'Last Month'    },
    { key: 'week',   label: 'This Week'     },
  ];
  let html = `
    <div class="att-mini-grid">
      <div class="amg-card"><div class="amg-val" style="color:var(--green)">${fp}</div><div class="amg-lbl">Present</div></div>
      <div class="amg-card"><div class="amg-val" style="color:var(--red)">${fa}</div><div class="amg-lbl">Absent</div></div>
      <div class="amg-card"><div class="amg-val" style="color:${fpc}">${fpct}%</div><div class="amg-lbl">Attendance</div></div>
    </div>
    <div style="background:var(--accent-bg);border:1.5px solid var(--accent-br);border-radius:14px;padding:13px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:11px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${filterKey === 'all' ? 'All Time' : 'Filtered'} Attendance</div>
        <div style="font-size:12px;color:var(--muted);font-weight:600">${fp} present of ${ft} classes</div>
      </div>
      <div style="font-size:32px;font-weight:900;color:${fpc}">${fpct}%</div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Filter by Period</div>
    <div class="date-range-bar">
      ${RANGES.map(r => `<div class="dr-chip${filterKey === r.key ? ' active' : ''}" onclick="renderSubjBodyAndUpdate('${stuId}','${subjectName}','${stuName}','${r.key}')">${r.label}</div>`).join('')}
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Lecture-wise Record — ${ft} classes</div>
    <div class="lec-log">`;
  if (!filtered.length) {
    html += `<div class="empty-state" style="padding:24px"><div class="e-icon">📄</div><div class="e-txt">No records in this period</div></div>`;
  } else {
    filtered.forEach((lec, i) => {
      html += `<div class="lec-row ${lec.status}"><span>Lecture ${i + 1} · ${lec.date}</span><span>${lec.status === 'present' ? '✅ Present' : '❌ Absent'}</span></div>`;
    });
  }
  html += '</div>';
  return html;
}

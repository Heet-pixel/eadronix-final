// ============================================================
//  student/js/dashboard.js
//  Dashboard page — all data from API.student.dashboard()
//  Expected API response shape:
//  {
//    success: true,
//    data: {
//      student: { name, rollNumber, semester, course, college, dept },
//      stats:   { totalSubjects, avgAttendance, totalNotices, pendingMarks },
//      attendance: [ { subject: { name, code }, percentage, present, absent, total } ],
//      recentNotices: [ { _id, title, createdAt } ],
//      timetableToday: [ { time, subject, room, type } ]
//    }
//  }
// ============================================================

const Dashboard = {
  async load() {
    // Always fetch fresh — a cached snapshot would hide new attendance,
    // notices, or subject changes made since the student last opened this tab.
    this._showSkeletons();

    try {
      const d = await API.student.dashboard();
      if (!d.success) throw new Error(d.message || 'Failed');
      this._render(d.data);
      NoticeBadge.refresh();
      this._loadChart();
    } catch (err) {
      this._showError(err.message);
    }
  },

  /* ── attendance graph (spec item 9) — needs dated per-subject records,
     which the lightweight dashboard bundle doesn't carry, so this is a
     small separate fetch of the same data the Attendance page uses ── */
  async _loadChart() {
    try {
      const d = await API.student.attendance();
      const subjects = d.subjects || d.data || d.summary || [];
      AttendanceChart.render('dash-att-chart', Array.isArray(subjects) ? subjects : Object.values(subjects), true);
    } catch (_) {
      // Non-critical — the rest of the dashboard already rendered fine
    }
  },

  /* ── skeletons while loading ─────────────────────────────── */
  _showSkeletons() {
    _el('dash-greeting').innerHTML  = UI.skeleton(1, 28);
    _el('dash-stats').innerHTML     = UI.skeleton(4, 80);
    _el('dash-att-chart').innerHTML = UI.skeleton(1, 160);
    _el('dash-att').innerHTML       = UI.skeleton(3, 70);
    _el('dash-notices').innerHTML   = UI.skeleton(2, 56);
    _el('dash-today').innerHTML     = UI.skeleton(2, 64);
  },

  /* ── render all sections ─────────────────────────────────── */
  _render(data) {
    const { student = {}, stats = {}, attendance = [], recentNotices = [], timetableToday = [] } = data;

    /* greeting */
    const firstName = (student.name || window.SAL_USER?.name || 'Student').split(' ')[0];
    _el('dash-greeting').innerHTML = `
      <div class="greeting">
        <div class="greeting__text">Hello, <strong>${firstName}</strong> 👋</div>
        <div class="greeting__sub">${student.course || ''} ${student.semester ? '· Sem ' + student.semester : ''}</div>
      </div>`;

    /* stat cards — each is clickable, jumps straight to its section */
    const statCards = [
      { icon: '📚', label: 'Subjects',      value: stats.totalSubjects   ?? '—', page: 'attendance' },
      { icon: '📊', label: 'Avg Attendance', value: (stats.avgAttendance != null ? stats.avgAttendance + '%' : '—'), page: 'attendance' },
      { icon: '📢', label: 'Notices',        value: stats.totalNotices   ?? '—', page: 'notices' },
      // { icon: '📝', label: 'Pending Marks',  value: stats.pendingMarks   ?? '—', page: 'marks' },
    ];
    _el('dash-stats').innerHTML = statCards.map(c => `
      <div class="stat-card" style="cursor:pointer" onclick="Nav.go('${c.page}')">
        <div class="stat-card__icon">${c.icon}</div>
        <div class="stat-card__val">${c.value}</div>
        <div class="stat-card__lbl">${c.label}</div>
      </div>`).join('');

    /* attendance quick-view (top 4 subjects) */
    if (!attendance.length) {
      _el('dash-att').innerHTML = UI.empty('📋', 'No attendance yet', 'Your teacher has not marked attendance yet.');
    } else {
      _el('dash-att').innerHTML = attendance.slice(0, 4).map(s => {
        const pct  = s.percentage ?? 0;
        const col  = UI.attColor(pct);
        const cls  = UI.attClass(pct);
        return `
          <div class="att-bar ${cls}" style="cursor:pointer" onclick="Nav.go('attendance')">
            <div class="att-bar__top">
              <span class="att-bar__name">${s.subject?.name || '—'}
                <span class="att-bar__code">${s.subject?.code ? '(' + s.subject.code + ')' : ''}</span>
              </span>
              <span class="att-bar__pct" style="color:${col}">${pct}%</span>
            </div>
            <div class="att-bar__track">
              <div class="att-bar__fill" style="width:${pct}%;background:${col}"></div>
            </div>
            <div class="att-bar__counts">${s.present}P · ${s.absent}A · ${s.total} total</div>
            ${pct < 75 ? '<div class="att-bar__warn">⚠️ Below 75% — attendance shortage</div>' : ''}
          </div>`;
      }).join('');
    }

    /* recent notices */
    if (!recentNotices.length) {
      _el('dash-notices').innerHTML = UI.empty('📭', 'No notices', 'Nothing posted yet.');
    } else {
      _el('dash-notices').innerHTML = recentNotices.map(n => `
        <div class="notice-mini" onclick="Nav.go('notices')">
          <div class="notice-mini__title">${n.title}</div>
          <div class="notice-mini__date">${UI.fromNow(n.createdAt)}</div>
        </div>`).join('');
    }

    /* today's classes */
    if (!timetableToday.length) {
      _el('dash-today').innerHTML = `
        <div class="free-day">
          <div class="free-day__icon">🎉</div>
          <div class="free-day__text">No classes today!</div>
        </div>`;
    } else {
      _el('dash-today').innerHTML = timetableToday.map(c => `
        <div class="class-card" style="cursor:pointer" onclick="Nav.go('timetable')">
          <div class="class-card__time">${c.time || '—'}</div>
          <div class="class-card__info">
            <div class="class-card__sub">${c.subject || '—'}</div>
            <div class="class-card__meta">Room ${c.room || '—'} · ${c.type || 'Lecture'}</div>
          </div>
        </div>`).join('');
    }
  },

  _showError(msg) {
    const html = UI.error(msg);
    ['dash-greeting','dash-stats','dash-att','dash-notices','dash-today'].forEach(id => {
      _el(id).innerHTML = html;
    });
  },
};

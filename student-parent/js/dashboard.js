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
    this._showSkeletons();

    try {
      const d = await API.student.dashboard();
      if (!d.success) throw new Error(d.message || "Failed");

      this._render(d.data);

      NoticeBadge.refresh();

      this._loadChart();

    } catch (err) {
      this._showError(err.message);
    }
  },

  async _loadChart() {
    try {
      const d = await API.student.attendance();

      const subjects =
        d.subjects ||
        d.data ||
        d.summary ||
        [];

      AttendanceChart.render(
        "dash-att-chart",
        Array.isArray(subjects)
          ? subjects
          : Object.values(subjects),
        true
      );

    } catch (_) {}
  },

  _showSkeletons() {
    _el("dash-greeting").innerHTML = UI.skeleton(1, 28);
    _el("dash-stats").innerHTML = UI.skeleton(4, 80);
    _el("dash-att-chart").innerHTML = UI.skeleton(1, 160);
    _el("dash-att").innerHTML = UI.skeleton(3, 70);
    _el("dash-notices").innerHTML = UI.skeleton(2, 56);
    _el("dash-today").innerHTML = UI.skeleton(2, 64);
  },

  _render(data) {

    const {
      student = {},
      stats = {},
      attendance = [],
      recentNotices = [],
      timetableToday = [],
    } = data;

    const firstName =
      (student.name || window.SAL_USER?.name || "Student")
      .split(" ")[0];

    _el("dash-greeting").innerHTML = `
      <div class="greeting">
        <div class="greeting__text">
          Hello,
          <strong>${firstName}</strong> 👋
        </div>

        <div class="greeting__sub">
          ${student.course || ""}
          ${student.semester ? "· Sem " + student.semester : ""}
        </div>
      </div>
    `;

    const statCards = [
      {
        icon: "📚",
        label: "Subjects",
        value: stats.totalSubjects ?? "—",
        page: "attendance",
      },
      {
        icon: "📊",
        label: "Avg Attendance",
        value:
          stats.avgAttendance != null
            ? stats.avgAttendance + "%"
            : "—",
        page: "attendance",
      },
      {
        icon: "📢",
        label: "Notices",
        value: stats.totalNotices ?? "—",
        page: "notices",
      },
    ];

    _el("dash-stats").innerHTML = statCards.map(c => `
      <div class="stat-card"
           style="cursor:pointer"
           onclick="Nav.go('${c.page}')">

          <div class="stat-card__icon">${c.icon}</div>

          <div class="stat-card__val">${c.value}</div>

          <div class="stat-card__lbl">${c.label}</div>

      </div>
    `).join("");

// Attendance is now displayed using the chart only.
_el("dash-att").innerHTML = "";
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

    [
      "dash-greeting",
      "dash-stats",
      "dash-att",
      "dash-notices",
      "dash-today",
    ].forEach(id => {
      _el(id).innerHTML = html;
    });

  },

};

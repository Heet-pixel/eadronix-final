// js/dashboard.js — Dashboard: overall courses, total subjects, no semester
const Dashboard = {
  async load() {
    UI.setNav('dashboard');
    document.getElementById('stat-grid').innerHTML =
      Array(5).fill('<div class="scard sk" style="height:90px"></div>').join('');
    document.getElementById('dash-recent').innerHTML = UI.sk(3, 55);
    document.getElementById('dash-dept-health').innerHTML = UI.sk(3, 32);
    try {
      const ov = await apiJson('/api/admin/overview');
      const d = ov.data || ov;
      Dashboard._renderStats(d);
      Dashboard._renderDeptHealth(d.deptHealth || []);
    } catch (e) {
      document.getElementById('stat-grid').innerHTML =
        `<div style="color:var(--red);padding:16px;grid-column:1/-1">Failed to load: ${e.message}</div>`;
    }
    try {
      const act = await apiJson('/api/admin/activity?limit=6');
      Dashboard._renderRecent(act.data || act.activities || []);
    } catch {
      document.getElementById('dash-recent').innerHTML =
        '<p style="color:var(--text3);font-size:13px;padding:8px">No recent activity.</p>';
    }
    const wd = document.getElementById('welcome-date');
    if (wd) wd.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  },

  _renderStats(d) {
    // No "semester" — show Overall Courses and Total Subjects
    const stats = [
      { icon: '🏛️', color: 'blue',   val: d.departments ?? 0,    label: 'Departments' },
      { icon: '👨‍🎓', color: 'green',  val: d.students ?? 0,       label: 'Total Students' },
      { icon: '👩‍🏫', color: 'amber',  val: d.teachers ?? 0,        label: 'Faculty Members' },
      { icon: '📚', color: 'blue',   val: d.courses ?? 0,         label: 'Overall Courses' },
      { icon: '🔬', color: 'purple', val: d.subjects ?? 0,        label: 'Total Subjects' },
    ];
    document.getElementById('stat-grid').innerHTML = stats.map(s => `
      <div class="scard ${s.color}">
        <div class="si" style="font-size:22px">${s.icon}</div>
        <div>
          <div class="sv">${UI.num(s.val)}</div>
          <div class="sl">${s.label}</div>
        </div>
      </div>`).join('');
  },

  _renderRecent(list) {
    const el = document.getElementById('dash-recent');
    if (!list.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:8px">No recent activity.</p>'; return; }
    el.innerHTML = list.map(a => `
      <div class="rrow">
        <div class="rav">${a.icon || '📌'}</div>
        <div class="rn">
          <div>${a.description || a.message || 'Action performed'}</div>
          <div class="re">${a.createdAt ? UI.fmt(a.createdAt) : '—'}</div>
        </div>
      </div>`).join('');
  },

  _renderDeptHealth(data) {
    const el = document.getElementById('dash-dept-health');
    if (!data.length) { el.innerHTML = '<p style="color:var(--text3);font-size:12px">No data.</p>'; return; }
    el.innerHTML = data.map(d => `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:12px;color:var(--text)">${d.name || d.code}</span>
          <span style="font-size:12px;color:var(--accent);font-weight:600">${d.attendance || d.att || 0}%</span>
        </div>
        <div style="background:var(--border);border-radius:6px;height:7px">
          <div style="width:${d.attendance || d.att || 0}%;background:var(--accent);border-radius:6px;height:100%;transition:width .5s"></div>
        </div>
      </div>`).join('');
  },
};

Dashboard._renderStats = function renderStats(d) {
  const stats = [
    { icon: '🏛️', color: 'blue',   val: d.departments ?? 0, label: 'Departments' },
    { icon: '🎓', color: 'green',  val: d.students ?? 0,    label: 'Total Students' },
    { icon: '👩‍🏫', color: 'amber', val: d.faculty ?? d.teachers ?? 0, label: 'Faculty Members' },
    { icon: '👨‍🏫', color: 'blue',  val: d.teachers ?? 0,    label: 'Total Teachers' },
    { icon: '🔬', color: 'purple', val: d.subjects ?? 0,    label: 'Total Subjects' },
  ];
  document.getElementById('stat-grid').innerHTML = stats.map(s => `
    <div class="scard ${s.color}">
      <div class="si" style="font-size:22px">${s.icon}</div>
      <div>
        <div class="sv">${UI.num(s.val)}</div>
        <div class="sl">${s.label}</div>
      </div>
    </div>`).join('');
};

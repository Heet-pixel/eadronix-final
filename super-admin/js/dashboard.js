const Dashboard = {
  async load() {
    UI.setActiveNav('dashboard');
    await Promise.all([Dashboard.loadStats(), Dashboard.loadRecentColleges()]);
  },
  async loadStats() {
    const grid = document.getElementById('dash-stats-grid');
    grid.innerHTML = UI.skeletonCards(6);
    const r = await API.getAnalytics();
    if (!r.ok) {
      grid.innerHTML = `<p class="error-text">${r.data?.message || 'Failed to load stats.'}</p>`;
      return;
    }
    // Handle both response shapes: r.data.data or r.data directly
    const d = r.data?.data || r.data || {};
    const colleges    = d.colleges    || { total:0, active:0, inactive:0 };
    const departments = d.departments || 0;
    const staff       = d.staff       || { principals:0, hods:0, teachers:0, total:0 };
    const students    = d.students    || { total:0 };

    const cards = [
      { label:'Total Colleges',  value:UI.formatNum(colleges.total),    sub:`${colleges.active} active · ${colleges.inactive} inactive`, icon:ICONS.college,    color:'blue'   },
      { label:'Departments',     value:UI.formatNum(departments),        sub:'Across all colleges',                                        icon:ICONS.department, color:'green'  },
      { label:'Principals',      value:UI.formatNum(staff.principals),   sub:`${staff.faculty ?? (staff.hods + staff.teachers)} faculty`,    icon:ICONS.principal,  color:'amber'  },
      { label:'HODs',            value:UI.formatNum(staff.hods),         sub:'Total HODs & Co-HODs',                                       icon:ICONS.hod,        color:'purple' },
      { label:'Total Students',  value:UI.formatNum(students.total),     sub:'Enrolled students',                                          icon:ICONS.student,    color:'accent' },
      { label:'Total Staff',     value:UI.formatNum(staff.total),        sub:'Principals + Faculty',                                       icon:ICONS.analytics,  color:'red'    },
    ];
    grid.innerHTML = cards.map(c => `
      <div class="stat-card stat-card--${c.color}">
        <div class="stat-icon stat-icon--${c.color}">${c.icon}</div>
        <div>
          <div class="stat-value">${c.value}</div>
          <div class="stat-label">${c.label}</div>
          <div class="stat-sub">${c.sub}</div>
        </div>
      </div>`).join('');
  },
  async loadRecentColleges() {
    const el = document.getElementById('dash-recent-list');
    el.innerHTML = '<div class="skeleton-row"><div class="skeleton-circle"></div><div class="skeleton-lines"><div class="skeleton-line w70"></div><div class="skeleton-line w40 mt4"></div></div></div>'.repeat(4);
    const { ok, data } = await API.getColleges({ page:1, limit:5 });
    if (!ok) { el.innerHTML = `<p class="error-text">${data?.message || 'Failed to load.'}</p>`; return; }
    const colleges = data.colleges || [];
    if (!colleges.length) {
      el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:8px">🏫</div>
        <div style="font-weight:500;margin-bottom:4px">No colleges yet</div>
        <div style="font-size:12px">Create your first college to get started.</div>
      </div>`;
      return;
    }
    el.innerHTML = colleges.map(c => `
      <div class="recent-row" onclick="CollegeDetail.load('${c._id}')">
        <div class="recent-avatar">${UI.getInitials(c.name)}</div>
        <div class="recent-info">
          <div class="recent-name">${c.name}</div>
          <div class="recent-meta">${c.code} &middot; ${c.departmentCount||0} depts &middot; ${UI.formatDate(c.createdAt)}</div>
        </div>
        <span class="badge ${c.isDeleted?'badge--danger':'badge--success'}">${c.isDeleted?'Inactive':'Active'}</span>
      </div>`).join('');
  },
};

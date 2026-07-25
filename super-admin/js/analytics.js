const Analytics = {
  _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  async load() {
    UI.setActiveNav('analytics');
    const el = document.getElementById('analytics-content');
    el.innerHTML = UI.skeletonCards(4);
    const { ok, data } = await API.getAnalytics();
    if (!ok) { el.innerHTML=`<p class="error-text">${data.message}</p>`; return; }
    const d = data.data;
    const bar=(label,val,tot,color)=>`<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span style="font-size:12px;font-weight:500">${label}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-secondary)">${UI.formatNum(val)} &middot; ${UI.pct(val,tot||1)}%</span>
      </div>
      <div style="height:8px;background:var(--bg-overlay);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${UI.pct(val,tot||1)}%;background:${color};border-radius:4px;transition:width .6s"></div>
      </div></div>`;
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:24px">
        ${[{label:'Colleges',value:UI.formatNum(d.colleges.total),sub:`${d.colleges.active} active`,color:'blue',icon:ICONS.college},
           {label:'Departments',value:UI.formatNum(d.departments),sub:'Total',color:'green',icon:ICONS.department},
           {label:'Total Staff',value:UI.formatNum(d.staff.total),sub:`${d.staff.principals}P · ${d.staff.hods}H · ${d.staff.teachers}T`,color:'amber',icon:ICONS.hod},
           {label:'Students',value:UI.formatNum(d.students.total),sub:'Enrolled',color:'purple',icon:ICONS.student},
          ].map(c=>`<div class="stat-card stat-card--${c.color}">
            <div class="stat-icon stat-icon--${c.color}">${c.icon}</div>
            <div><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div><div class="stat-sub">${c.sub}</div></div>
          </div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
        <div class="overview-card">
          <div class="overview-card-title">College Status</div>
          ${bar('Active',d.colleges.active,d.colleges.total,'var(--green)')}
          ${bar('Inactive',d.colleges.inactive,d.colleges.total,'var(--red)')}
        </div>
        <div class="overview-card">
          <div class="overview-card-title">Staff Breakdown</div>
          ${bar('Principals',d.staff.principals,d.staff.total,'var(--purple)')}
          ${bar('HODs',d.staff.hods,d.staff.total,'var(--blue)')}
          ${bar('Teachers',d.staff.teachers,d.staff.total,'var(--green)')}
        </div>
      </div>
      <div class="overview-card overview-card--full">
        <div class="overview-card-title">People per College — every college, all roles combined</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:14px">
          ${(d.perCollege || []).length ? d.perCollege.map(c => `
            <div class="college-people-card">
              <div class="college-people-name">${this._esc(c.name)}${c.code ? ` <span class="college-people-code">${this._esc(c.code)}</span>` : ''}</div>
              <div class="college-people-total">${UI.formatNum(c.totalPeople)}</div>
              <div class="college-people-sub">Total People</div>
              <div class="college-people-breakdown">
                <span>🎓 ${UI.formatNum(c.students)} Students</span>
                <span>🧑‍🏫 ${UI.formatNum(c.teachers)} Teachers/HODs</span>
                <span>🧑‍💼 ${UI.formatNum(c.principals)} Admins</span>
                <span>🏛️ ${UI.formatNum(c.departments)} Depts</span>
              </div>
              <span class="college-people-status ${c.active ? 'is-active' : 'is-inactive'}">${c.active ? 'Active' : 'Inactive'}</span>
            </div>`).join('') : '<p class="error-text" style="grid-column:1/-1">No colleges yet.</p>'}
        </div>
      </div>`;
  },
};

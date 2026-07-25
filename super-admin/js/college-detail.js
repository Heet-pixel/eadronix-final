const CollegeDetail = {
  _id: null, _tab: 'overview',
  async load(id) {
    CollegeDetail._id  = id;
    CollegeDetail._tab = 'overview';
    UI.setActiveNav('college-detail');
    CollegeDetail._skeleton();
    await CollegeDetail._fetch();
  },
  async reload() { await CollegeDetail._fetch(); },
  async _fetch() {
    const { ok, data } = await API.getCollege(CollegeDetail._id);
    if (!ok) { document.getElementById('tab-overview').innerHTML=`<p class="error-text">${data.message}</p>`; return; }
    const { college, principals, departments, hods, teachers, studentStats } = data;
    CollegeDetail._college = college;
    document.getElementById('detail-college-initials').textContent = UI.getInitials(college.name);
    document.getElementById('detail-college-name').textContent     = college.name;
    document.getElementById('detail-college-code').textContent     = college.code;
    document.getElementById('detail-college-status').innerHTML =
      `<span class="badge badge-lg ${college.isDeleted?'badge--danger':'badge--success'}">${college.isDeleted?'Inactive':'Active'}</span>`;
    document.getElementById('detail-quick-stats').innerHTML = `
      <span class="quick-stat">${ICONS.department} ${departments.length} Depts</span>
      <span class="quick-stat">${ICONS.hod} ${hods.length} HODs</span>
      <span class="quick-stat">${ICONS.student} ${UI.formatNum(studentStats.total)} Students</span>
      <span class="quick-stat">${ICONS.principal} ${principals.length} Principal${principals.length!==1?'s':''}</span>`;
    CollegeDetail._renderTab(CollegeDetail._tab, { college, principals, departments, hods, teachers, studentStats });
  },
  _renderTab(tab, d) {
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(p=>p.classList.add('hidden'));
    const pane = document.getElementById(`tab-${tab}`);
    if (pane) pane.classList.remove('hidden');
    switch(tab) {
      case 'overview':    CollegeDetail._overview(d); break;
      case 'departments': Departments.render(d.departments, d.college._id, d.college); break;
      case 'people':      Staff.renderPeople(d.principals, d.hods, d.teachers, d.college); break;
      case 'students':    CollegeDetail._students(d.studentStats, d.departments); break;
    }
  },
  switchTab(tab) { CollegeDetail._tab=tab; CollegeDetail._fetch(); },
  _overview({ college, departments, hods, teachers, studentStats, principals }) {
    const el = document.getElementById('tab-overview');
    el.innerHTML = `
      <div class="overview-grid">
        <div class="overview-card">
          <div class="overview-card-title" style="display:flex;align-items:center;justify-content:space-between">
            College Information
            ${!college.isDeleted?`<button class="btn btn-sm btn-ghost" onclick="CollegeDetail.openEdit()">${ICONS.edit||''} Edit</button>`:''}
          </div>
          <div class="info-grid">
            <div class="info-field"><span class="info-label">Email</span><span class="info-value">${college.email||'—'}</span></div>
            <div class="info-field"><span class="info-label">Phone</span><span class="info-value">${college.phone||'—'}</span></div>
            <div class="info-field"><span class="info-label">Website</span><span class="info-value">${college.website||'—'}</span></div>
            <div class="info-field"><span class="info-label">Code</span><span class="info-value"><span class="code-badge">${college.code}</span></span></div>
            <div class="info-field"><span class="info-label">City</span><span class="info-value">${college.city||'—'}</span></div>
            <div class="info-field"><span class="info-label">State</span><span class="info-value">${college.state||'—'}</span></div>
            <div class="info-field"><span class="info-label">Pincode</span><span class="info-value">${college.pincode||'—'}</span></div>
            <div class="info-field"><span class="info-label">Address</span><span class="info-value">${college.address||'—'}</span></div>
            <div class="info-field"><span class="info-label">Created</span><span class="info-value">${UI.formatDate(college.createdAt)}</span></div>
            <div class="info-field"><span class="info-label">Status</span><span class="info-value"><span class="badge ${college.isDeleted?'badge--danger':'badge--success'}">${college.isDeleted?'Inactive':'Active'}</span></span></div>
          </div>
        </div>
        <div class="overview-card">
          <div class="overview-card-title">At a Glance</div>
          <div class="glance-grid">
            <div class="glance-item glance-item--blue"><div class="glance-val">${departments.length}</div><div class="glance-lbl">Departments</div></div>
            <div class="glance-item glance-item--green"><div class="glance-val">${UI.formatNum(studentStats.total)}</div><div class="glance-lbl">Students</div></div>
            <div class="glance-item glance-item--amber"><div class="glance-val">${hods.length}</div><div class="glance-lbl">HODs</div></div>
            <div class="glance-item glance-item--purple"><div class="glance-val">${teachers.length + hods.length}</div><div class="glance-lbl">Faculty</div></div>
            <div class="glance-item glance-item--accent"><div class="glance-val">${UI.formatNum(studentStats.active||0)}</div><div class="glance-lbl">Active Students</div></div>
            <div class="glance-item glance-item--red"><div class="glance-val">${principals.length}</div><div class="glance-lbl">Principals</div></div>
          </div>
        </div>
        <div class="overview-card overview-card--full">
          <div class="overview-card-title" style="display:flex;align-items:center;justify-content:space-between">
            Departments Overview
            ${!college.isDeleted?`<button class="btn btn-sm btn-primary" onclick="Departments.openCreate('${college._id}')">${ICONS.plus} Add Dept</button>`:''}
          </div>
          ${!departments.length?`<div class="empty-chip">No departments yet.</div>`:`
          <table class="data-table"><thead><tr><th>Department</th><th>Code</th><th>HODs</th><th>Faculty</th><th>Students</th><th></th></tr></thead>
          <tbody>${departments.map(d=>`
            <tr class="trow" onclick="DeptDetail.load('${d._id}','${d.college||college._id}')" style="cursor:pointer">
              <td>${d.name}</td>
              <td><span class="code-badge">${d.code}</span></td>
              <td>${d.hods&&d.hods.length?d.hods.map(h=>`<div style="font-size:11px">${h.name}</div>`).join(''):'<span class="no-data">None</span>'}</td>
              <td>${d.facultyCount ?? d.teacherCount ?? 0}</td>
              <td>${UI.formatNum(d.studentStats&&d.studentStats.total||0)}</td>
              <td><span class="link-text">Open →</span></td>
            </tr>`).join('')}</tbody></table>`}
        </div>
        ${!college.isDeleted?`
        <div class="overview-card overview-card--full">
          <div class="overview-card-title">Danger Zone</div>
          <div class="danger-zone">
            <div><div class="danger-zone-title">Deactivate College</div>
            <div class="danger-zone-desc">Requires deletion password. All staff will be deactivated.</div></div>
            <button class="btn btn-danger" onclick="CollegeDetail.confirmDeactivate('${college._id}','${college.name.replace(/'/g,"\\'")}')">Deactivate</button>
          </div>
        </div>`:''}
      </div>`;
  },
  _students(stats, departments) {
    const el = document.getElementById('tab-students');
    const bar=(val,tot,color)=>`<div style="height:7px;background:var(--bg-overlay);border-radius:4px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${UI.pct(val,tot||1)}%;background:${color};border-radius:4px;transition:width .5s"></div></div>`;
    el.innerHTML = `
      <div class="students-top">
        <div class="student-big-stat"><div class="big-val">${UI.formatNum(stats.total)}</div><div class="big-lbl">Total</div></div>
        <div class="student-big-stat student-big-stat--green"><div class="big-val">${UI.formatNum(stats.active||0)}</div><div class="big-lbl">Active</div></div>
        <div class="student-big-stat student-big-stat--red"><div class="big-val">${UI.formatNum(stats.inactive||0)}</div><div class="big-lbl">Inactive</div></div>
      </div>
      <div class="gender-section">
        <div class="overview-card-title">Gender Breakdown</div>
        <div class="gender-grid">
          <div class="gender-item"><div class="gender-label">Boys</div><div class="gender-count">${UI.formatNum(stats.boys||0)} <span class="gender-pct">${UI.pct(stats.boys||0,stats.total||1)}%</span></div>${bar(stats.boys||0,stats.total,'var(--blue)')}</div>
          <div class="gender-item"><div class="gender-label">Girls</div><div class="gender-count">${UI.formatNum(stats.girls||0)} <span class="gender-pct">${UI.pct(stats.girls||0,stats.total||1)}%</span></div>${bar(stats.girls||0,stats.total,'var(--accent)')}</div>
          <div class="gender-item"><div class="gender-label">Other</div><div class="gender-count">${UI.formatNum(stats.other||0)} <span class="gender-pct">${UI.pct(stats.other||0,stats.total||1)}%</span></div>${bar(stats.other||0,stats.total,'var(--purple)')}</div>
        </div>
      </div>
      <div class="overview-card-title mt16">By Department — click to manage</div>
      ${!departments.length?`<div class="empty-chip">No departments.</div>`:`
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Department</th><th>Total</th><th>Boys</th><th>Girls</th><th>Other</th><th>Active</th><th>Inactive</th><th></th></tr></thead>
        <tbody>${departments.map(d=>{const s=d.studentStats||{};return`
          <tr class="trow" onclick="DeptDetail.load('${d._id}','${d.college||''}')" style="cursor:pointer">
            <td><span class="code-badge">${d.code}</span> ${d.name}</td>
            <td><strong>${UI.formatNum(s.total||0)}</strong></td>
            <td>${UI.formatNum(s.boys||0)}</td><td>${UI.formatNum(s.girls||0)}</td><td>${UI.formatNum(s.other||0)}</td>
            <td><span class="badge badge--success">${UI.formatNum(s.active||0)}</span></td>
            <td><span class="badge badge--danger">${UI.formatNum(s.inactive||0)}</span></td>
            <td><span class="link-text">Manage →</span></td>
          </tr>`;}).join('')}</tbody>
      </table></div>`}`;
  },
  _skeleton() {
    document.getElementById('detail-college-initials').textContent='..';
    document.getElementById('detail-college-name').textContent='Loading…';
    document.getElementById('detail-college-code').textContent='';
    document.getElementById('detail-college-status').innerHTML='';
    document.getElementById('detail-quick-stats').innerHTML='';
    document.getElementById('tab-overview').innerHTML='<div class="overview-grid"><div class="overview-card skeleton-card"></div><div class="overview-card skeleton-card"></div></div>';
  },
  confirmDeactivate(id, name) {
    // Prompt for deletion password — this already IS the strong confirmation
    // for this action (a secret password, not just a typed name), since a
    // whole college and everything under it is being permanently deleted.
    const pw = prompt(`This will PERMANENTLY delete "${name}" and everything in it (departments, staff, students, records). This cannot be undone.\n\nEnter the deletion password to confirm:`);
    if (!pw) return;
    UI.confirm({ title:'Permanently Delete College', message:`Permanently delete "${name}" and everything in it? This cannot be undone.`, confirmText:'Delete Permanently', type:'danger',
      onConfirm: async () => {
        UI.showLoader();
        const { ok, data } = await API.deactivateCollege(id, pw);
        UI.hideLoader();
        if (!ok) { UI.toast(data.message,'error'); return; }
        UI.toast(`"${name}" permanently deleted.`,'warning');
        await CollegeDetail.reload();
      }
    });
  },
  // Spec: college details can be edited again after creation. Pre-fills the
  // Edit College modal from the college object already loaded on this page.
  openEdit() {
    const c = CollegeDetail._college;
    if (!c) return;
    document.getElementById('ec-id').value       = c._id;
    document.getElementById('ec-name').value     = c.name || '';
    document.getElementById('ec-code').value     = c.code || '';
    document.getElementById('ec-email').value    = c.email || '';
    document.getElementById('ec-phone').value    = c.phone || '';
    document.getElementById('ec-website').value  = c.website || '';
    document.getElementById('ec-street').value   = c.address || '';
    document.getElementById('ec-city').value     = c.city || '';
    document.getElementById('ec-state').value    = c.state || '';
    document.getElementById('ec-pincode').value  = c.pincode || '';
    UI.openModal('modal-edit-college');
  },
  async handleEditCollege(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-edit-college-submit');
    UI.setBtnLoading(btn, true, 'Saving...');
    const id = document.getElementById('ec-id').value;
    const payload = {
      name:    document.getElementById('ec-name').value,
      code:    document.getElementById('ec-code').value,
      email:   document.getElementById('ec-email').value,
      phone:   document.getElementById('ec-phone').value,
      website: document.getElementById('ec-website').value,
      address: document.getElementById('ec-street').value,
      city:    document.getElementById('ec-city').value,
      state:   document.getElementById('ec-state').value,
      pincode: document.getElementById('ec-pincode').value,
    };
    const { ok, data } = await API.updateCollege(id, payload);
    UI.setBtnLoading(btn, false);
    if (!ok) { UI.toast(data.message, 'error'); return; }
    UI.closeModal('modal-edit-college');
    UI.toast(`"${payload.name}" updated!`, 'success');
    await CollegeDetail.reload();
  },
};

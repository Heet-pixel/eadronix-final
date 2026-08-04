const DeptDetail = {
  _deptId: null, _collegeId: null,
  async load(deptId, collegeId) {
    DeptDetail._deptId    = deptId;
    DeptDetail._collegeId = collegeId;
    document.querySelectorAll('.content-section').forEach(s=>s.classList.add('hidden'));
    document.getElementById('section-dept-detail').classList.remove('hidden');
    document.getElementById('page-title').textContent = 'Department Detail';
    await DeptDetail._fetch();
  },
  async reload() { await DeptDetail._fetch(); },
  async _fetch() {
    const { ok, data } = await API.getDeptDetail(DeptDetail._deptId);
    if (!ok) { document.getElementById('dept-detail-body').innerHTML=`<p class="error-text">${data.message}</p>`; return; }
    const { dept, college, hods, teachers, students, stats } = data;
    const facultyCount = data.facultyCount ?? (hods.length + teachers.length);
    document.getElementById('dept-back-btn').onclick = () => CollegeDetail.load(college._id);
    document.getElementById('dept-back-label').textContent = college.name;
    document.getElementById('dept-detail-code').textContent    = dept.code;
    document.getElementById('dept-detail-name').textContent    = dept.name;
    document.getElementById('dept-detail-college').textContent = college.name;
    document.getElementById('dept-detail-stats').innerHTML = `
      <span class="quick-stat">${ICONS.student} ${stats.total} Students</span>
      <span class="quick-stat">${ICONS.hod} ${facultyCount} Faculty</span>
      <span class="quick-stat" style="color:${hods.length?'var(--green)':'var(--red)'}">
        ${hods.length?`&#10003; ${hods.length} Dept Admin${hods.length>1?'s':''}` : '&#9888; No Dept Admin'}</span>`;
    document.getElementById('dept-detail-body').innerHTML =
      DeptDetail._statsHtml(stats) +
      DeptDetail._hodSection(hods, dept, college) +
      DeptDetail._teachersSection(teachers, dept, college) +
      DeptDetail._studentsSection(students, dept, college);
  },
  _statsHtml(s) {
    const bar=(v,t,c)=>`<div style="height:6px;background:var(--bg-overlay);border-radius:3px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${UI.pct(v,t||1)}%;background:${c};border-radius:3px;transition:width .5s"></div></div>`;
    return `<div class="dept-stat-banner">
      <div class="dept-stat-box dept-stat-box--blue"><div class="dsb-val">${UI.formatNum(s.total)}</div><div class="dsb-lbl">Total Students</div></div>
      <div class="dept-stat-box dept-stat-box--green"><div class="dsb-val">${UI.formatNum(s.active||0)}</div><div class="dsb-lbl">Active</div></div>
      <div class="dept-stat-box dept-stat-box--red"><div class="dsb-val">${UI.formatNum(s.inactive||0)}</div><div class="dsb-lbl">Inactive</div></div>
      <div class="dept-stat-box" style="flex:2;min-width:180px">
        <div class="dsb-lbl" style="margin-bottom:6px">Gender</div>
        <div style="display:flex;gap:12px">
          <div style="flex:1"><div style="font-size:11px;color:var(--text-secondary)">Boys ${UI.pct(s.boys||0,s.total||1)}%</div>${bar(s.boys||0,s.total,'var(--blue)')}</div>
          <div style="flex:1"><div style="font-size:11px;color:var(--text-secondary)">Girls ${UI.pct(s.girls||0,s.total||1)}%</div>${bar(s.girls||0,s.total,'var(--accent)')}</div>
          <div style="flex:1"><div style="font-size:11px;color:var(--text-secondary)">Other ${UI.pct(s.other||0,s.total||1)}%</div>${bar(s.other||0,s.total,'var(--purple)')}</div>
        </div>
      </div>
    </div>`;
  },
  _hodSection(hods, dept, college) {
    return `<div class="detail-section-block">
      <div class="dsb-header">
        <h3 class="dsb-title">Dept Admins <span class="count-badge">${hods.length}</span></h3>
      </div>
      <p style="font-size:12px;color:var(--text3);margin:-4px 0 8px">View only — Dept Admin/Co-Dept Admin are added, edited, and removed by Admin.</p>
      ${hods.length?hods.map(h=>`
        <div class="staff-card staff-card--hod">
          <div class="staff-avatar staff-avatar--hod">${UI.avatarInnerHtml(h, UI.getInitials(h.name))}</div>
          <div class="staff-info">
            <div class="staff-name">${h.name} ${UI.roleBadge(h.role)}</div>
            <div class="staff-email">${h.email}</div><div class="staff-phone">${h.mobile||'—'}</div>
            <div class="staff-meta">Added by <strong>${h.createdBy&&h.createdBy.name||'Unknown'}</strong> ${UI.roleBadge(h.createdBy&&h.createdBy.role||'super_admin')} &middot; ${UI.formatDate(h.createdAt)}
              ${h.isFirstLogin?'<span class="badge badge--warning" style="margin-left:4px">Pending Setup</span>':''}
            </div>
          </div>
        </div>`).join(''):`<div class="empty-chip">No Dept Admins assigned yet.</div>`}
    </div>`;
  },
  _teachersSection(teachers, dept, college) {
    const canEdit = !college.isDeleted;
    return `<div class="detail-section-block">
      <div class="dsb-header">
        <h3 class="dsb-title">Teachers <span class="count-badge">${teachers.length}</span></h3>
        ${canEdit?`<button class="btn btn-secondary btn-sm" onclick="Staff.openAddTeacher('${college._id}','${dept._id}')">${ICONS.plus} Add Teacher</button>`:''}
      </div>
      ${teachers.length?`<div class="teachers-grid">${teachers.map(t=>`
        <div class="staff-card">
          <div class="staff-avatar">${UI.avatarInnerHtml(t, UI.getInitials(t.name))}</div>
          <div class="staff-info">
            <div class="staff-name">${t.name} ${UI.roleBadge('teacher')}</div>
            <div class="staff-email">${t.email}</div><div class="staff-phone">${t.mobile||'—'}</div>
            <div class="staff-meta">By <strong>${t.createdBy&&t.createdBy.name||'Unknown'}</strong> &middot; ${UI.formatDate(t.createdAt)}
              ${t.isFirstLogin?'<span class="badge badge--warning" style="margin-left:4px">Pending</span>':''}
            </div>
          </div>
          ${canEdit?`<div style="display:flex;flex-direction:column;gap:6px;margin-left:auto">
            <button class="icon-btn" onclick="Staff.openEditStaff('${t._id}')" style="color:var(--blue);border-color:var(--blue-border)">${ICONS.edit}</button>
            <button class="icon-btn icon-btn--danger" onclick="Staff.confirmRemove('${t._id}','${t.name.replace(/'/g,"\\'")}','teacher')">${ICONS.trash}</button>
          </div>`:''}
        </div>`).join('')}</div>`:`<div class="empty-chip">No teachers in this department.</div>`}
    </div>`;
  },
  _studentsSection(students, dept, college) {
    const canEdit = !college.isDeleted;
    return `<div class="detail-section-block">
      <div class="dsb-header">
        <h3 class="dsb-title">Students <span class="count-badge">${students.length}</span></h3>
        ${canEdit?`<button class="btn btn-primary btn-sm" onclick="DeptDetail.openAddStudent('${dept._id}','${dept.college||''}')">${ICONS.plus} Add Student</button>`:''}
      </div>
      ${!students.length?`<div class="empty-chip">No students enrolled yet.</div>`:`
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Student</th><th>Roll No</th><th>Gender</th><th>DOB</th><th>Phone</th><th>City</th><th>Status</th>${canEdit?'<th>Actions</th>':''}</tr></thead>
        <tbody>${students.map(s=>`
          <tr class="trow ${!s.isActive?'trow--inactive':''}">
            <td><div class="cell-college">
              <div class="cell-avatar" style="background:var(--${s.gender==='female'?'accent':s.gender==='other'?'purple':'blue'}-dim);color:var(--${s.gender==='female'?'accent':s.gender==='other'?'purple':'blue'});border-color:var(--${s.gender==='female'?'accent':s.gender==='other'?'purple':'blue'}-border)">${UI.avatarInnerHtml(s, UI.getInitials(s.name))}</div>
              <div><div class="cell-name">${s.name}</div><div class="cell-sub">${s.email}</div></div>
            </div></td>
            <td><span class="code-badge">${s.rollNumber||'—'}</span></td>
            <td><span class="badge ${s.gender==='female'?'badge--info':s.gender==='other'?'badge--warning':'badge--blue'}" style="text-transform:capitalize">${s.gender||'—'}</span></td>
            <td style="font-family:var(--mono);font-size:11px">${s.dob?UI.formatDate(s.dob):'—'}</td>
            <td style="font-family:var(--mono);font-size:11px">${s.mobile||'—'}</td>
            <td>${s.address&&s.address.city||'—'}</td>
            <td><span class="badge ${s.isActive?'badge--success':'badge--danger'}">${s.isActive?'Active':'Inactive'}</span></td>
            ${canEdit?`<td style="white-space:nowrap">
              <button class="icon-btn" onclick="DeptDetail.openEditStudent('${s._id}')" style="color:var(--blue);border-color:var(--blue-border)">${ICONS.edit}</button>
              <button class="icon-btn icon-btn--danger" onclick="DeptDetail.confirmDelete('${s._id}','${s.name.replace(/'/g,"\\'")}')  " style="margin-left:4px">${ICONS.trash}</button>
            </td>`:''}
          </tr>`).join('')}
        </tbody></table></div>`}
    </div>`;
  },
  openAddStudent(deptId, collegeId) {
    UI.clearForm('form-student');
    document.getElementById('student-mode').value        = 'add';
    document.getElementById('student-id').value          = '';
    document.getElementById('student-dept-id').value     = deptId;
    document.getElementById('student-college-id').value  = collegeId;
    document.getElementById('student-modal-title').textContent = 'Add Student';
    document.getElementById('student-active-wrap').classList.add('hidden');
    DeptDetail._loadStudentCourses(deptId);
    UI.openModal('modal-student');
  },
  openEditStudent(studentId) {
    fetch(`/api/super/students/${studentId}`, { headers:{'Authorization':'Bearer '+localStorage.getItem('sal_token')} })
      .then(r=>r.json()).then(d=>{
        if (!d.success) { UI.toast(d.message,'error'); return; }
        const s = d.user;
        UI.clearForm('form-student');
        document.getElementById('student-mode').value = 'edit';
        document.getElementById('student-id').value   = s._id;
        document.getElementById('student-dept-id').value    = s.department;
        document.getElementById('student-college-id').value = s.college;
        document.getElementById('student-modal-title').textContent = 'Edit Student';
        document.getElementById('student-active-wrap').classList.remove('hidden');
        document.getElementById('stu-name').value    = s.name;
        document.getElementById('stu-email').value   = s.email;
        document.getElementById('stu-phone').value   = s.mobile||'';
        document.getElementById('stu-dob').value     = s.dob||'';
        document.getElementById('stu-gender').value  = s.gender||'male';
        document.getElementById('stu-roll').value    = s.rollNumber||'';
        DeptDetail._loadStudentCourses(s.department, s.courseName || s.course || '');
        document.getElementById('stu-sem').value     = String(s.semester || s.sem || 1);
        document.getElementById('stu-active').checked= s.isActive;
        document.getElementById('stu-street').value  = s.address&&s.address.street||'';
        document.getElementById('stu-city').value    = s.address&&s.address.city||'';
        document.getElementById('stu-state').value   = s.address&&s.address.state||'';
        document.getElementById('stu-pincode').value = s.address&&s.address.pincode||'';
        UI.openModal('modal-student');
      });
  },
  async handleStudentSubmit(e) {
    e.preventDefault();
    const btn  = document.getElementById('btn-student-submit');
    const mode = document.getElementById('student-mode').value;
    if (!document.getElementById('stu-course').value) { UI.toast('Course is required.', 'error'); return; }
    UI.setBtnLoading(btn, true, mode==='add'?'Adding...':'Saving...');
    const payload = {
      name:document.getElementById('stu-name').value, email:document.getElementById('stu-email').value,
      mobile:document.getElementById('stu-phone').value, dob:document.getElementById('stu-dob').value,
      gender:document.getElementById('stu-gender').value, rollNumber:document.getElementById('stu-roll').value,
      street:document.getElementById('stu-street').value, city:document.getElementById('stu-city').value,
      state:document.getElementById('stu-state').value, pincode:document.getElementById('stu-pincode').value,
      collegeId:document.getElementById('student-college-id').value,
      departmentId:document.getElementById('student-dept-id').value,
      isActive:document.getElementById('stu-active').checked,
      course:document.getElementById('stu-course').value,
      courseName:document.getElementById('stu-course').value,
      sem:Number(document.getElementById('stu-sem').value || 1),
      semester:Number(document.getElementById('stu-sem').value || 1),
    };
    let result;
    if (mode==='add') result = await API.addStudent(payload);
    else result = await API.updateStudent(document.getElementById('student-id').value, payload);
    UI.setBtnLoading(btn, false);
    if (!result.ok) { UI.toast(result.data.message,'error'); return; }
    UI.closeModal('modal-student');
    UI.toast(mode==='add'?`${payload.name} enrolled!`:`${payload.name} updated!`,'success');
    await DeptDetail.reload();
  },
  confirmDelete(id, name) {
    UI.confirm({ title:'Permanently Delete Student', message:`This will permanently delete "${name}" from the system. This cannot be undone.`, confirmText:'Delete Permanently', type:'danger', requireTypedName: name,
      onConfirm: async () => {
        UI.showLoader();
        const { ok, data } = await API.deleteStudent(id);
        UI.hideLoader();
        if (!ok) { UI.toast(data.message,'error'); return; }
        UI.toast(`"${name}" permanently deleted.`,'warning');
        await DeptDetail.reload();
      }
    });
  },
  async _loadStudentCourses(deptId, selected='') {
    const el = document.getElementById('stu-course');
    if (!el) return;
    el.innerHTML = '<option value="">— Select Course —</option>';
    if (!deptId) return;
    try {
      const res = await fetch(`/api/super/departments/${deptId}/courses`, { headers:{'Authorization':'Bearer '+localStorage.getItem('sal_token')} });
      const d = await res.json();
      const list = d.courses || d.data || [];
      el.innerHTML = '<option value="">— Select Course —</option>' + list.map(c=>`<option value="${c.name}">${c.name}</option>`).join('');
      el.value = selected || '';
    } catch { /* keep placeholder */ }
  },
};

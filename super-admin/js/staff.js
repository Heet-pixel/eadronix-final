const Staff = {
  renderPeople(principals, hods, teachers, college) {
    const el      = document.getElementById('tab-people');
    const canEdit = !college.isDeleted;
    el.innerHTML = `
      <div class="detail-section-block">
        <div class="dsb-header">
          <h3 class="dsb-title">Principals <span class="count-badge">${principals.length}</span></h3>
          ${canEdit?`<button class="btn btn-primary btn-sm" onclick="Staff.openAppointPrincipal('${college._id}')">${ICONS.plus} Add Principal</button>`:''}
        </div>
        ${principals.length?principals.map(p=>Staff._card(p,'admin',canEdit,college._id)).join(''):`<div class="empty-chip">No principals assigned yet.</div>`}
      </div>
      <div class="detail-section-block mt24">
        <div class="dsb-header">
          <h3 class="dsb-title">HODs <span class="count-badge">${hods.length}</span></h3>
        </div>
        ${hods.length?hods.map(h=>Staff._card(h,h.role,canEdit,college._id)).join(''):`<div class="empty-chip">No HODs appointed. Go to Departments tab.</div>`}
      </div>
      <div class="detail-section-block mt24">
        <div class="dsb-header">
          <h3 class="dsb-title">Teachers <span class="count-badge">${teachers.length}</span></h3>
          ${canEdit?`<button class="btn btn-secondary btn-sm" onclick="Staff.openAddTeacher('${college._id}','')">${ICONS.plus} Add Teacher</button>`:''}
        </div>
        ${teachers.length?teachers.map(t=>Staff._card(t,'teacher',canEdit,college._id)).join(''):`<div class="empty-chip">No teachers added yet.</div>`}
      </div>`;
  },
  _card(user, role, canEdit, collegeId) {
    const dept = user.department;
    const addedBy = user.createdBy;
    const isHodRole = role === 'hod' || role === 'co_hod';
    const showActions = canEdit && !isHodRole;
    return `
      <div class="staff-card ${role==='admin'?'staff-card--principal':isHodRole?'staff-card--hod':''}">
        <div class="staff-avatar ${role==='admin'?'staff-avatar--lg':isHodRole?'staff-avatar--hod':''}">${UI.avatarInnerHtml(user, UI.getInitials(user.name))}</div>
        <div class="staff-info">
          <div class="staff-name">${user.name} ${UI.roleBadge(role)}</div>
          <div class="staff-email">${user.email}</div>
          <div class="staff-phone">${user.mobile||'—'}</div>
          ${dept?`<div class="staff-dept-tag">${dept.code||''} · ${dept.name||''}</div>`:''}
          <div class="staff-meta">
            Added by <strong>${addedBy&&addedBy.name||'Super Admin'}</strong> ${UI.roleBadge(addedBy&&addedBy.role||'super_admin')}
            &middot; ${UI.formatDate(user.createdAt)}
            ${user.isFirstLogin?'<span class="badge badge--warning" style="margin-left:4px">Pending Setup</span>':''}
          </div>
          ${isHodRole?'<div style="font-size:11px;color:var(--text3);margin-top:4px">View only — edited/removed by Admin</div>':''}
        </div>
        ${showActions?`<div style="display:flex;flex-direction:column;gap:6px;margin-left:auto">
          <button class="icon-btn" onclick="Staff.openEditStaff('${user._id}')" title="Edit" style="color:var(--blue);border-color:var(--blue-border)">${ICONS.edit}</button>
          <button class="icon-btn icon-btn--danger" onclick="Staff.confirmRemove('${user._id}','${user.name.replace(/'/g,"\\'")}','${role}')" title="Remove">${ICONS.trash}</button>
        </div>`:''}
      </div>`;
  },
  openAppointPrincipal(collegeId) {
    document.getElementById('ap-college-id').value = collegeId;
    UI.clearForm('form-appoint-principal');
    document.getElementById('ap-college-id').value = collegeId;
    UI.openModal('modal-appoint-principal');
  },
  async handleAppointPrincipal(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-appoint-principal-submit');
    UI.setBtnLoading(btn, true, 'Adding...');
    const collegeId = document.getElementById('ap-college-id').value;
    const payload = { name:document.getElementById('ap-name').value, email:document.getElementById('ap-email').value, mobile:document.getElementById('ap-phone').value };
    const { ok, data } = await API.appointPrincipal(collegeId, payload);
    UI.setBtnLoading(btn, false);
    if (!ok) { UI.toast(data.message,'error'); return; }
    UI.closeModal('modal-appoint-principal'); UI.clearForm('form-appoint-principal');
    UI.toast(`${payload.name} added as Principal! Welcome email sent.`,'success');
    await CollegeDetail.reload();
  },
  openAppointHOD(deptId, deptName, collegeId) {
    document.getElementById('hod-dept-id').value    = deptId;
    document.getElementById('hod-college-id').value = collegeId;
    document.getElementById('hod-dept-label').textContent = deptName;
    UI.clearForm('form-appoint-hod');
    document.getElementById('hod-dept-id').value    = deptId;
    document.getElementById('hod-college-id').value = collegeId;
    document.getElementById('hod-dept-label').textContent = deptName;
    UI.openModal('modal-appoint-hod');
  },
  async handleAppointHOD(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-appoint-hod-submit');
    UI.setBtnLoading(btn, true, 'Appointing...');
    const deptId = document.getElementById('hod-dept-id').value;
    const payload = {
      name:document.getElementById('hod-name').value, email:document.getElementById('hod-email').value,
      mobile:document.getElementById('hod-phone').value, role:document.getElementById('hod-role-select').value||'hod'
    };
    const { ok, data } = await API.appointHOD(deptId, payload);
    UI.setBtnLoading(btn, false);
    if (!ok) { UI.toast(data.message,'error'); return; }
    UI.closeModal('modal-appoint-hod'); UI.clearForm('form-appoint-hod');
    UI.toast(`${payload.name} appointed as HOD! Welcome email sent.`,'success');
    if (!document.getElementById('section-dept-detail').classList.contains('hidden')) await DeptDetail.reload();
    else await CollegeDetail.reload();
  },
  openAddTeacher(collegeId, prefillDeptId) {
    // Clear form FIRST before populating the select
    UI.clearForm('form-add-teacher');
    document.getElementById('teacher-college-id').value = collegeId;
    const select = document.getElementById('teacher-dept-select');
    select.disabled = false;
    select.innerHTML = `<option value="">-- Loading departments... --</option>`;
    UI.openModal('modal-add-teacher');
    // Fetch depts from API and populate AFTER modal is open
    fetch(`/api/super/colleges/${collegeId}/departments`, { headers:{ 'Authorization':'Bearer '+localStorage.getItem('sal_token') } })
      .then(r=>r.json()).then(d=>{
        const departments = d.departments || d.data?.departments || [];
        if (d.success && departments.length) {
          if (prefillDeptId) {
            const dep = departments.find(x => String(x._id) === String(prefillDeptId));
            select.innerHTML = dep
              ? `<option value="${dep._id}" selected>${dep.name} (${dep.shortCode || dep.code || ''})</option>`
              : `<option value="">-- Selected department not found --</option>`;
            select.disabled = true;
          } else {
            select.innerHTML = `<option value="">-- Select Department --</option>` +
              departments.map(dep=>`<option value="${dep._id}">${dep.name} (${dep.shortCode || dep.code || ''})</option>`).join('');
          }
        } else {
          select.innerHTML = `<option value="">-- No departments found --</option>`;
        }
      }).catch(() => {
        select.innerHTML = `<option value="">-- Failed to load --</option>`;
      });
  },
  async handleAddTeacher(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-add-teacher-submit');
    UI.setBtnLoading(btn, true, 'Adding...');
    const collegeId = document.getElementById('teacher-college-id').value;
    const select    = document.getElementById('teacher-dept-select');
    const deptId    = select.value;
    if (!deptId) { UI.toast('Please select a department.','error'); UI.setBtnLoading(btn,false); return; }
    const payload = { name:document.getElementById('teacher-name').value, email:document.getElementById('teacher-email').value, mobile:document.getElementById('teacher-phone').value };
    const { ok, data } = await API.addTeacher(collegeId, deptId, payload);
    UI.setBtnLoading(btn, false);
    if (!ok) { UI.toast(data.message,'error'); return; }
    UI.closeModal('modal-add-teacher'); UI.clearForm('form-add-teacher');
    select.disabled = false;
    UI.toast(`${payload.name} added as Teacher!`,'success');
    if (!document.getElementById('section-dept-detail').classList.contains('hidden')) await DeptDetail.reload();
    else await CollegeDetail.reload();
  },
  openEditStaff(userId) {
    fetch(`/api/super/staff/${userId}`, { headers:{'Authorization':'Bearer '+localStorage.getItem('sal_token')} })
      .then(r=>r.json()).then(d=>{
        if (!d.success) { UI.toast(d.message,'error'); return; }
        const u = d.user;
        document.getElementById('edit-staff-id').value    = u._id;
        document.getElementById('edit-staff-name').value  = u.name;
        document.getElementById('edit-staff-email').value = u.email;
        document.getElementById('edit-staff-phone').value = u.mobile||'';
        document.getElementById('edit-staff-modal-title').textContent = `Edit ${u.role}: ${u.name}`;
        UI.openModal('modal-edit-staff');
      });
  },
  async handleEditStaff(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-edit-staff-submit');
    UI.setBtnLoading(btn, true, 'Saving...');
    const id = document.getElementById('edit-staff-id').value;
    const payload = { name:document.getElementById('edit-staff-name').value, email:document.getElementById('edit-staff-email').value, mobile:document.getElementById('edit-staff-phone').value };
    const { ok, data } = await API.updateStaff(id, payload);
    UI.setBtnLoading(btn, false);
    if (!ok) { UI.toast(data.message,'error'); return; }
    UI.closeModal('modal-edit-staff');
    UI.toast(`${payload.name} updated!`,'success');
    if (!document.getElementById('section-dept-detail').classList.contains('hidden')) await DeptDetail.reload();
    else await CollegeDetail.reload();
  },
  confirmRemove(id, name, role) {
    UI.confirm({ title:`Permanently Delete ${role}`, message:`This will permanently delete "${name}" from the system. This cannot be undone.`, confirmText:'Delete Permanently', type:'danger', requireTypedName: name,
      onConfirm: async () => {
        UI.showLoader();
        const { ok, data } = await API.removeStaff(id);
        UI.hideLoader();
        if (!ok) { UI.toast(data.message,'error'); return; }
        UI.toast(`"${name}" permanently deleted.`,'warning');
        if (!document.getElementById('section-dept-detail').classList.contains('hidden')) await DeptDetail.reload();
        else await CollegeDetail.reload();
      }
    });
  },
};

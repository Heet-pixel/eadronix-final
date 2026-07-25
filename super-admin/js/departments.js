const Departments = {
  render(departments, collegeId, college) {
    const el = document.getElementById('tab-departments');
    const canAdd = !college.isDeleted;
    el.innerHTML = `
      <div class="tab-toolbar">
        <h3 class="tab-section-title">Departments <span class="count-badge">${departments.length}</span></h3>
        ${canAdd?`<button class="btn btn-primary btn-sm" onclick="Departments.openCreate('${collegeId}')">${ICONS.plus} Add Department</button>`:''}
      </div>
      ${!departments.length
        ?`<div class="empty-state mt20">${ICONS.department}<p>No departments yet.</p></div>`
        :`<div class="dept-grid">${departments.map(d=>Departments._card(d,college)).join('')}</div>`}`;
  },
  _card(dept, college) {
    const canEdit = !college.isDeleted;
    const hods = dept.hods || [];
    return `
      <div class="dept-card" onclick="DeptDetail.load('${dept._id}','${dept.college||college._id}')" style="cursor:pointer">
        <div class="dept-card-header">
          <div class="dept-badge">${dept.code}</div>
          <div class="dept-card-actions" onclick="event.stopPropagation()">
            ${canEdit?`<button class="icon-btn icon-btn--danger" onclick="Departments.confirmDelete('${dept._id}','${dept.name.replace(/'/g,"\\'")}',event)" title="Delete">${ICONS.trash}</button>`:''}
          </div>
        </div>
        <div class="dept-name">${dept.name}</div>
        <div class="dept-stats-row">
          <div class="dept-stat"><span class="dept-stat-val">${UI.formatNum(dept.studentStats&&dept.studentStats.total||0)}</span><span class="dept-stat-lbl">Students</span></div>
          <div class="dept-stat"><span class="dept-stat-val">${dept.facultyCount ?? dept.teacherCount ?? 0}</span><span class="dept-stat-lbl">Faculty</span></div>
        </div>
        <div class="dept-hod-section">
          ${hods.length
            ?hods.map(h=>`<div class="hod-chip"><div class="hod-avatar">${UI.avatarInnerHtml(h, UI.getInitials(h.name))}</div>
              <div><div class="hod-name">${h.name}</div>
              <div class="hod-meta">${UI.roleBadge(h.role)} &middot; By ${h.createdBy&&h.createdBy.name||'Unknown'}</div></div></div>`).join('')
            :`<div class="no-hod-chip">No HOD assigned</div>`}
        </div>
        <div class="dept-open-hint">Click to open department →</div>
      </div>`;
  },
  openCreate(collegeId) {
    document.getElementById('dept-college-id').value = collegeId;
    UI.clearForm('form-create-dept');
    document.getElementById('dept-college-id').value = collegeId;
    UI.openModal('modal-create-dept');
  },
  async handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-create-dept-submit');
    UI.setBtnLoading(btn, true, 'Creating...');
    const collegeId = document.getElementById('dept-college-id').value;
    const payload = { name: document.getElementById('dept-name').value, shortCode: document.getElementById('dept-code').value, collegeId };
    const { ok, data } = await API.createDepartment(payload);
    UI.setBtnLoading(btn, false);
    if (!ok) { UI.toast(data.message,'error'); return; }
    UI.closeModal('modal-create-dept'); UI.clearForm('form-create-dept');
    UI.toast(`Department created!`,'success');
    await CollegeDetail.reload();
  },
  confirmDelete(id, name, evt) {
    if (evt) evt.stopPropagation();
    UI.confirm({ title:'Permanently Delete Department', message:`This will permanently delete "${name}" and its courses/subjects. This cannot be undone.`, confirmText:'Delete Permanently', type:'danger', requireTypedName: name,
      onConfirm: async () => {
        UI.showLoader();
        const { ok, data } = await API.deleteDepartment(id);
        UI.hideLoader();
        if (!ok) { UI.toast(data.message,'error'); return; }
        UI.toast(`"${name}" permanently deleted.`,'warning');
        await CollegeDetail.reload();
      }
    });
  },
};

const Faculty={
  _page:1,_search:'',_role:'',
  async load(){
    UI.setNav('faculty');
    this._bindEvents();
    // Populate dept dropdowns
    const deps=await API.getDepts();
    if(deps.success){
      const opts=deps.data.map(d=>`<option value="${d._id}">${d.name}</option>`).join('');
      ['fac-dept','hod-dept'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='<option value="">Select dept</option>'+opts;});
    }
    await this.fetch();
  },
  _bindEvents(){
    const si=document.getElementById('fac-search');
    if(si._b) return; si._b=true;
    let t; si.addEventListener('input',e=>{clearTimeout(t);t=setTimeout(()=>{Faculty._search=e.target.value;Faculty._page=1;Faculty.fetch();},400);});
  },
  async fetch(){
    const tbody=document.getElementById('fac-tbody');
    tbody.innerHTML=`<tr><td colspan="5">${UI.sk(4,40)}</td></tr>`;
    const q=[`page=${this._page}`,`limit=15`,this._search?`search=${encodeURIComponent(this._search)}`:'',`role=${this._role}`].filter(Boolean).join('&');
    const d=await API.getUsers(q+'&role='+encodeURIComponent(JSON.stringify({$in:['admin','hod','co_hod','teacher']})));
    // Simpler: role filter via query
    const d2=await API.getUsers([`page=${this._page}`,`limit=15`,this._search?`search=${encodeURIComponent(this._search)}`:''].filter(Boolean).join('&')+'&role=teacher');
    if(!d2.success){tbody.innerHTML=UI.emptyRow(5);return;}
    document.getElementById('fac-count').textContent=`(${UI.num(d2.meta?.total||0)})`;
    this.renderTable(d2.data);
    this.renderPager(d2.meta);
  },
  renderTable(list){
    const tbody=document.getElementById('fac-tbody');
    if(!list.length){tbody.innerHTML=UI.emptyRow(5,'No faculty found.');return;}
    tbody.innerHTML=list.map(u=>`<tr><td><div style="display:flex;align-items:center;gap:8px"><div class="av">${UI.initials(u.name)}</div><div><div style="font-weight:500">${u.name}</div><div style="font-size:11px;color:#8b949e">${u.email}</div></div></div></td><td><span class="rtag r-${u.role}">${u.role.replace('_',' ')}</span></td><td>${u.department?.name||'—'}</td><td>${u.mobile||'—'}</td><td><span class="badge ${u.isActive?'bg':'br'}">${u.isActive?'Active':'Inactive'}</span></td><td><button class="ibtn" onclick="Faculty.toggle('${u._id}','${u.name}',${u.isActive})">${u.isActive?'⏸':'▶'}</button><button class="ibtn del" onclick="Faculty.del('${u._id}','${u.name}')">🗑</button></td></tr>`).join('');
  },
  renderPager(meta){
    const el=document.getElementById('fac-pager');if(!meta||meta.totalPages<=1){el.innerHTML='';return;}
    el.innerHTML=`<button class="pb${meta.page<=1?' dis':''}" onclick="Faculty._page=${meta.page-1};Faculty.fetch()">‹</button>`+Array.from({length:meta.totalPages},(_, i)=>`<button class="pb${i+1===meta.page?' act':''}" onclick="Faculty._page=${i+1};Faculty.fetch()">${i+1}</button>`).join('')+`<button class="pb${meta.page>=meta.totalPages?' dis':''}" onclick="Faculty._page=${meta.page+1};Faculty.fetch()"></button>`;
  },
  async toggle(id,name,active){if(!confirm(`${active?'Deactivate':'Activate'} ${name}?`))return;const d=await API.toggleUser(id);if(d.success){UI.toast(d.message);Faculty.fetch();}else UI.toast(d.message,'error');},
  async del(id,name){UI.confirmDelete({itemLabel:'faculty member',name,onConfirm:async()=>{const d=await API.deleteUser(id);if(d.success){UI.toast('Permanently deleted');Faculty.fetch();}else UI.toast(d.message,'error');}});},
  async createFaculty(){
    const name=document.getElementById('fac-name').value.trim();
    const email=document.getElementById('fac-email').value.trim();
    const mobile=document.getElementById('fac-mobile').value.trim();
    const role=document.getElementById('fac-role').value;
    const department=document.getElementById('fac-dept').value;
    if(!name||!email){UI.toast('Name and email required','error');return;}
    const d=await API.createFaculty({name,email,mobile,role,department});
    if(d.success){UI.toast(d.message);UI.closeAll();Faculty.fetch();}else UI.toast(d.message,'error');
  },
  async assignHod(){
    const teacherId=document.getElementById('hod-teacher').value;
    const departmentId=document.getElementById('hod-dept').value;
    const role=document.getElementById('hod-role').value;
    if(!teacherId||!departmentId){UI.toast('Select teacher and department','error');return;}
    // Load teachers first
    const d=await API.assignHod({teacherId,departmentId,role});
    if(d.success){UI.toast(d.message);UI.closeAll();}else UI.toast(d.message,'error');
  },
  async loadTeachersForHod(){
    const d=await API.getUsers('role=teacher&limit=100');
    if(!d.success)return;
    document.getElementById('hod-teacher').innerHTML='<option value="">Select teacher</option>'+d.data.map(t=>`<option value="${t._id}">${t.name} (${t.email})</option>`).join('');
  },
};
 
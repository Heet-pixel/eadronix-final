const Colleges = {
  _page:1, _search:'', _filter:'all',
  async load() {
    UI.setActiveNav('colleges');
    Colleges._bindEvents();
    await Colleges._fetch();
  },
  async _fetch() {
    const tbody = document.getElementById('colleges-tbody');
    const pgEl  = document.getElementById('colleges-pagination');
    tbody.innerHTML = UI.skeletonRows(6,6);
    pgEl.innerHTML  = '';
    const { ok, data } = await API.getColleges({ page:Colleges._page, search:Colleges._search, filter:Colleges._filter });
    if (!ok) { tbody.innerHTML = `<tr><td colspan="6" class="td-empty"><p class="error-text">${data.message}</p></td></tr>`; return; }
    const { colleges, pagination } = data;
    document.getElementById('college-count-badge').textContent = UI.formatNum(pagination.total);
    if (!colleges.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="td-empty"><div class="empty-state">${ICONS.college}<p>No colleges found.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = colleges.map(c=>`
      <tr class="trow ${c.isDeleted?'trow--inactive':''}" onclick="CollegeDetail.load('${c._id}')">
        <td><div class="cell-college"><div class="cell-avatar">${UI.getInitials(c.name)}</div>
          <div><div class="cell-name">${c.name}</div><div class="cell-sub">${c.email||'—'}</div></div></div></td>
        <td><span class="code-badge">${c.code}</span></td>
        <td>${c.departmentCount||0}</td>
        <td>${c.principals&&c.principals.length?c.principals.map(p=>`<div class="cell-name" style="font-size:11px">${p.name}</div>`).join(''):`<span class="no-data">Not assigned</span>`}</td>
        <td style="font-family:var(--mono);font-size:12px;color:var(--text-secondary)">${UI.formatDate(c.createdAt)}</td>
        <td><span class="badge ${c.isDeleted?'badge--danger':'badge--success'}">${c.isDeleted?'Inactive':'Active'}</span></td>
      </tr>`).join('');
    Colleges._renderPagination(pagination);
  },
  _renderPagination(pg) {
    const el = document.getElementById('colleges-pagination');
    if (!pg||pg.totalPages<=1) return;
    let html = `<button class="page-btn ${!pg.hasPrev?'disabled':''}" onclick="Colleges._goTo(${pg.page-1})" ${!pg.hasPrev?'disabled':''}>&lsaquo;</button>`;
    for (let i=1; i<=pg.totalPages; i++) {
      if (i===1||i===pg.totalPages||(i>=pg.page-1&&i<=pg.page+1)) html+=`<button class="page-btn ${i===pg.page?'active':''}" onclick="Colleges._goTo(${i})">${i}</button>`;
      else if (i===pg.page-2||i===pg.page+2) html+=`<span class="page-ellipsis">…</span>`;
    }
    html+=`<button class="page-btn ${!pg.hasNext?'disabled':''}" onclick="Colleges._goTo(${pg.page+1})" ${!pg.hasNext?'disabled':''}>&rsaquo;</button>`;
    el.innerHTML = html;
  },
  _goTo(page) { if(page<1)return; Colleges._page=page; Colleges._fetch(); },
  _bindEvents() {
    const si = document.getElementById('college-search');
    if (si&&!si.dataset.bound) {
      si.dataset.bound='1';
      let timer;
      si.addEventListener('input', e=>{ clearTimeout(timer); timer=setTimeout(()=>{ Colleges._search=e.target.value.trim(); Colleges._page=1; Colleges._fetch(); },380); });
    }
    document.querySelectorAll('#colleges-filter-tabs .filter-tab').forEach(tab=>{
      if (tab.dataset.bound) return; tab.dataset.bound='1';
      tab.addEventListener('click',()=>{
        document.querySelectorAll('#colleges-filter-tabs .filter-tab').forEach(t=>t.classList.remove('active'));
        tab.classList.add('active'); Colleges._filter=tab.dataset.filter; Colleges._page=1; Colleges._fetch();
      });
    });
    const form = document.getElementById('form-create-college');
    if (form&&!form.dataset.bound) { form.dataset.bound='1'; form.addEventListener('submit', Colleges._handleCreate); }
  },
  async _handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-create-college-submit');
    UI.setBtnLoading(btn, true, 'Creating...');
    const payload = {
      name:             document.getElementById('cc-name').value,
      code:             document.getElementById('cc-code').value,
      email:            document.getElementById('cc-email').value,
      phone:            document.getElementById('cc-phone').value,
      website:          document.getElementById('cc-website').value,
      address:          document.getElementById('cc-street').value,
      city:             document.getElementById('cc-city').value,
      state:            document.getElementById('cc-state').value,
      pincode:          document.getElementById('cc-pincode').value,
      deletionPassword: document.getElementById('cc-del-pw').value,
    };
    const { ok, data } = await API.createCollege(payload);
    UI.setBtnLoading(btn, false);
    if (!ok) { UI.toast(data.message, 'error'); return; }
    UI.closeModal('modal-create-college');
    UI.clearForm('form-create-college');
    UI.toast(`College "${payload.name}" created!`, 'success');
    Colleges._page = 1;
    await Colleges._fetch();
  },
  async refresh() { await Colleges._fetch(); },
};

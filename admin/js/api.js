// Singleton in-flight refresh — see teacher/js/api.js for the full explanation.
let _refreshPromise=null;
function _doRefresh(rt){
  if(!_refreshPromise){
    _refreshPromise=fetch('/api/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:rt})})
      .then(async(rr)=>{ if(!rr.ok) throw new Error('refresh failed'); const rd=await rr.json(); localStorage.setItem('sal_at',rd.accessToken); if(rd.refreshToken) localStorage.setItem('sal_rt',rd.refreshToken); return rd; })
      .finally(()=>{ _refreshPromise=null; });
  }
  return _refreshPromise;
}
async function salFetch(method,path,body=null,retry=false){
  const at=localStorage.getItem('sal_at');
  const h={'Content-Type':'application/json'};
  if(at) h['Authorization']='Bearer '+at;
  const o={method,headers:h};if(body) o.body=JSON.stringify(body);
  let r=await fetch('/api'+path,o);
  if(r.status===401&&!retry){
    const rt=localStorage.getItem('sal_rt');
    if(rt){
      try { await _doRefresh(rt); return salFetch(method,path,body,true); } catch(_) { /* fall through to logout */ }
    }
    localStorage.clear();window.location.href='/login';return{success:false};
  }
  return r.json();
}
const get=(p)=>salFetch('GET',p);
const post=(p,b)=>salFetch('POST',p,b);
const put=(p,b)=>salFetch('PUT',p,b);
const del=(p)=>salFetch('DELETE',p);

const API={
  me:()=>get('/auth/me'),
  logout:()=>post('/auth/logout'),
  overview:()=>get('/admin/overview'),
  // Departments
  getDepts:()=>get('/admin/departments'),
  createDept:(b)=>post('/admin/departments',b),
  updateDept:(id,b)=>put('/admin/departments/'+id,b),
  deleteDept:(id)=>del('/admin/departments/'+id),
  // Subjects
  getSubjects:(q='')=>get('/admin/subjects'+(q?'?'+q:'')),
  createSubject:(b)=>post('/admin/subjects',b),
  updateSubject:(id,b)=>put('/admin/subjects/'+id,b),
  deleteSubject:(id)=>del('/admin/subjects/'+id),
  // HOD
  assignHod:(b)=>post('/admin/hod',b),
  // Faculty
  createFaculty:(b)=>post('/admin/faculty',b),
  // Students
  createStudent:(b)=>post('/admin/students',b),
  // Users
  getUsers:(q='')=>get('/admin/users'+(q?'?'+q:'')),
  toggleUser:(id)=>post('/admin/users/'+id+'/toggle'),
  deleteUser:(id)=>del('/admin/users/'+id),
  // Notices
  getNotices:(q='')=>get('/admin/notices'+(q?'?'+q:'')),
  createNotice:(b)=>post('/admin/notices',b),
  deleteNotice:(id)=>del('/admin/notices/'+id),
};

// ── Global apiJson helper (used by dashboard.js, students.js, notices.js etc.) ──
// Defined here so all modules can use it regardless of script load order
async function apiJson(url, opts) {
  const at = localStorage.getItem('sal_at') || localStorage.getItem('sal_token');
  const headers = { 'Content-Type': 'application/json', ...((opts || {}).headers || {}) };
  if (at) headers['Authorization'] = 'Bearer ' + at;
  const res = await fetch(url, { ...(opts || {}), headers });
  if (res.status === 401) { localStorage.clear(); window.location.replace('/login'); throw new Error('Unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}

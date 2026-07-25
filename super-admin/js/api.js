// ============================================================
// super-admin/js/api.js — Real HTTP with Auto Token Refresh
// Uses SAL_AUTH from shared/auth.js for persistent sessions
// ============================================================
const API = {
  _req(method, url, body) { return SAL_AUTH.apiRequest(method, url, body); },
  _get(url)        { return this._req('GET',    url); },
  _post(url, body) { return this._req('POST',   url, body); },
  _put(url, body)  { return this._req('PUT',    url, body); },
  _del(url, body)  { return this._req('DELETE', url, body); },

  // Analytics
  async getAnalytics() { return this._get('/api/super/analytics'); },

  // Colleges
  async getColleges({ page=1, search='', filter='all', limit=8 } = {}) {
    const q = new URLSearchParams({ page, limit, search, filter }).toString();
    const r = await this._get(`/api/super/colleges?${q}`);
    if (!r.ok) return r;
    return { ok:true, data: { colleges:r.data.colleges, pagination:r.data.pagination } };
  },
  async getCollege(id) {
    const r = await this._get(`/api/super/colleges/${id}`);
    return r.ok ? { ok:true, data:r.data } : r;
  },
  async createCollege(p) { return this._post('/api/super/colleges', p); },
  async updateCollege(id, p) { return this._put(`/api/super/colleges/${id}`, p); },
  async deactivateCollege(id, deletionPassword) { return this._del(`/api/super/colleges/${id}`, { deletionPassword }); },

  // Departments
  async getDeptDetail(id) {
    const r = await this._get(`/api/super/departments/${id}/detail`);
    return r.ok ? { ok:true, data:r.data } : r;
  },
  async createDepartment({ name, shortCode, collegeId }) {
    return this._post(`/api/super/colleges/${collegeId}/departments`, { name, shortCode });
  },
  async deleteDepartment(id) { return this._del(`/api/super/departments/${id}`); },

  // Staff
  async appointPrincipal(collegeId, p) { return this._post(`/api/super/colleges/${collegeId}/principals`, p); },
  async appointHOD(deptId, p)          { return this._post(`/api/super/departments/${deptId}/hods`, p); },
  async addTeacher(collegeId, deptId, p){ return this._post(`/api/super/departments/${deptId}/teachers`, p); },
  async updateStaff(id, p)  { return this._put(`/api/super/staff/${id}`, p); },
  async removeStaff(id)     { return this._del(`/api/super/staff/${id}`); },
  async removePrincipal(collegeId, userId) { return this._del(`/api/super/staff/${userId}`); },
  async removeHOD(deptId, userId)          { return this._del(`/api/super/staff/${userId}`); },
  async removeTeacher(id)   { return this._del(`/api/super/staff/${id}`); },

  // Students
  async addStudent(p)          { return this._post(`/api/super/departments/${p.departmentId}/students`, p); },
  async updateStudent(id, p)   { return this._put(`/api/super/students/${id}`, p); },
  async deleteStudent(id)      { return this._del(`/api/super/students/${id}`); },
};

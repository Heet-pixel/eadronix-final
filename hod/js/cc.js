// hod/js/cc.js — Class Coordinator Management + Courses & Departments View

/* ═══ CLASS COORDINATOR SECTION ═══ */

let _ccTeachers = [];  // all teachers in dept
let _ccAssignments = []; // current CC assignments from DB

async function loadCCSection() {
  const container = document.getElementById('ccContent');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text2)">Loading…</div>`;

  try {
    // Fetch teachers and CC assignments in parallel
    const [tData, ccData] = await Promise.all([
      apiJson('/api/hod/teachers'),
      apiJson('/api/hod/cc')
    ]);
    _ccTeachers = (tData.teachers || []);
    _ccAssignments = (ccData.ccAssignments || []);
    renderCCSection(container);
  } catch (e) {
    container.innerHTML = `<div style="color:var(--red);padding:16px">Failed to load: ${e.message}</div>`;
  }
}

function renderCCSection(container) {
  // Build a flat list of all CC assignments across teachers
  const allAssignments = [];
  _ccAssignments.forEach(teacher => {
    (teacher.ccAssignments || []).forEach(a => {
      allAssignments.push({ teacher, course: a.course, semester: a.semester });
    });
  });

  // Group by course
  const byCourse = {};
  allAssignments.forEach(a => {
    if (!byCourse[a.course]) byCourse[a.course] = [];
    byCourse[a.course].push(a);
  });

  const courses = HOD_COURSES.length ? HOD_COURSES : Object.keys(byCourse);

  let html = `
    <div style="margin-bottom:20px;">
      <button class="btn btn-primary" onclick="openAssignCCModal()">➕ Appoint Class Coordinator</button>
    </div>

    <div style="margin-bottom:12px;font-size:13px;color:var(--text2);">
      A <strong>Class Coordinator (CC)</strong> can view all student marks and attendance for their assigned semester.
      Other teachers can only view their own records.
    </div>`;

  if (!allAssignments.length) {
    html += `<div class="empty-state"><div class="e-icon">📋</div><p>No Class Coordinators appointed yet. Click "Appoint Class Coordinator" to get started.</p></div>`;
  } else {
    // Show by course
    courses.forEach(course => {
      const assignments = (byCourse[course] || []).sort((a, b) => a.semester - b.semester);
      if (!assignments.length) return;
      html += `
        <div style="margin-bottom:24px;">
          <div style="font-size:15px;font-weight:700;color:var(--accent);margin-bottom:10px;border-bottom:2px solid var(--border);padding-bottom:6px;">
            📚 ${course}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
            ${assignments.map(a => `
              <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px;">
                <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0;">
                  ${(a.teacher.name || 'T').trim()[0].toUpperCase()}
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;color:var(--text);font-size:14px;">${a.teacher.name}</div>
                  <div style="font-size:12px;color:var(--text2);">${a.teacher.email || ''}</div>
                  <div style="margin-top:4px;">
                    <span style="background:var(--blue-light,#e3f0ff);color:var(--blue,#2563eb);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;">Sem ${a.semester} CC</span>
                  </div>
                </div>
                <button onclick="removeCC('${a.teacher._id || a.teacher.id}','${a.course}',${a.semester})"
                  style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--red,#ef4444);padding:4px;" title="Remove CC">✕</button>
              </div>`).join('')}
          </div>
        </div>`;
    });
  }

  // Show unassigned sems
  html += `
    <div style="margin-top:24px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="font-weight:700;margin-bottom:10px;">📄 All Semester CC Status</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">`;

  courses.forEach(course => {
    for (let sem = 1; sem <= SEM_COUNT; sem++) {
      const a = allAssignments.find(x => x.course === course && x.semester === sem);
      html += `
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;">
          <div style="color:var(--text2);font-size:11px;margin-bottom:2px;">${course} · Sem ${sem}</div>
          <div style="font-weight:600;color:${a ? 'var(--green,#16a34a)' : 'var(--text2)'}">
            ${a ? `✅ ${a.teacher.name}` : '— Not assigned'}
          </div>
        </div>`;
    }
  });

  html += `</div></div>

  <!-- CC Assign Modal -->
  <div id="ccModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center;" onclick="if(event.target===this)closeCCModal()">
    <div style="background:var(--card);border-radius:16px;padding:28px;width:min(480px,95vw);max-height:90vh;overflow:auto;">
      <h3 style="margin:0 0 20px;font-size:18px;">Appoint Class Coordinator</h3>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Course</label>
          <select id="ccCourse" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:14px;">
            ${courses.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Semester</label>
          <select id="ccSemester" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:14px;">
            ${Array.from({length: SEM_COUNT}, (_, i) => `<option value="${i+1}">Semester ${i+1}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Teacher</label>
          <select id="ccTeacher" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:14px;">
            <option value="">— Select Teacher —</option>
            ${_ccTeachers.map(t => `<option value="${t._id || t.id}">${t.name} ${t.email ? '('+t.email+')' : ''}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:10px;margin-top:8px;">
          <button class="btn btn-primary" style="flex:1" onclick="saveCC()">✅ Appoint CC</button>
          <button class="btn btn-ghost" style="flex:1" onclick="closeCCModal()">Cancel</button>
        </div>
      </div>
    </div>
  </div>`;

  container.innerHTML = html;
}

function openAssignCCModal() {
  const modal = document.getElementById('ccModal');
  if (modal) { modal.style.display = 'flex'; }
}

function closeCCModal() {
  const modal = document.getElementById('ccModal');
  if (modal) { modal.style.display = 'none'; }
}

async function saveCC() {
  const course = document.getElementById('ccCourse')?.value;
  const semester = document.getElementById('ccSemester')?.value;
  const teacherId = document.getElementById('ccTeacher')?.value;
  if (!teacherId) { showToast('Please select a teacher', true); return; }
  try {
    await apiJson('/api/hod/cc', {
      method: 'POST',
      body: JSON.stringify({ teacherId, course, semester: Number(semester) })
    });
    closeCCModal();
    showToast('Class Coordinator appointed successfully!');
    await loadCCSection();
  } catch (e) {
    showToast(e.message || 'Failed to appoint CC', true);
  }
}

async function removeCC(teacherId, course, semester) {
  if (!confirm(`Remove CC assignment for ${course} Sem ${semester}?`)) return;
  try {
    await apiJson('/api/hod/cc', {
      method: 'DELETE',
      body: JSON.stringify({ teacherId, course, semester: Number(semester) })
    });
    showToast('CC assignment removed.');
    await loadCCSection();
  } catch (e) {
    showToast(e.message || 'Failed', true);
  }
}


/* ═══ COURSES & DEPARTMENTS VIEW (read-only, reflects admin/super-admin) ═══ */

async function loadCoursesSection() {
  const container = document.getElementById('coursesContent');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text2)">Loading…</div>`;

  try {
    const [deptData, courseData] = await Promise.all([
      apiJson('/api/hod/departments'),
      apiJson('/api/hod/courses')
    ]);

    const depts = deptData.departments || [];
    const courses = courseData.courses || [];

    // Update HOD_COURSES from live course data
    const liveCourseNames = [...new Set(courses.map(c => c.name).filter(Boolean))];
    if (liveCourseNames.length) {
      HOD_COURSES = liveCourseNames;
      if (currentHOD) currentHOD.courses = HOD_COURSES;
    }

    let html = `
      <div style="margin-bottom:8px;font-size:13px;color:var(--text2);padding:10px 14px;background:var(--card);border-radius:10px;border:1px solid var(--border);">
        ℹ️ This information is <strong>managed by Admin / Super Admin</strong>. Changes made by them are automatically reflected here.
      </div>

      <!-- DEPARTMENTS -->
      <div style="margin-top:20px;margin-bottom:8px;font-size:16px;font-weight:700;color:var(--text);">🏛️ Departments</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin-bottom:28px;">`;

    if (!depts.length) {
      html += `<div style="grid-column:1/-1;color:var(--text2);padding:16px;">No departments found.</div>`;
    } else {
      const icons = {'fa-laptop-code':'💻','fa-atom':'⚛️','fa-flask':'🧪','fa-calculator':'🔢','fa-bolt':'⚡','fa-cogs':'⚙️','fa-heartbeat':'❤️','fa-paint-brush':'🎨','fa-chart-line':'📈','fa-building':'🏛️'};
      depts.forEach(d => {
        html += `
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;">
            <div style="font-size:28px;margin-bottom:6px;">${icons[d.icon] || '🏛️'}</div>
            <div style="font-weight:700;font-size:15px;color:var(--text);">${d.name}</div>
            <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">${d.code || d.shortCode || ''} ${d.establishedYear ? '· Est. ' + d.establishedYear : ''}</div>
            <div style="display:flex;gap:14px;font-size:13px;color:var(--text2);">
              <span>👨‍🎓 ${d.studentCount ?? 0} students</span>
              <span>🧑‍🏫 ${d.teacherCount ?? 0} teachers</span>
              <span>📚 ${d.courseCount ?? 0} courses</span>
            </div>
            ${d.hod ? `<div style="margin-top:8px;font-size:12px;color:var(--text2);">Head: <strong>${d.hod.name || ''}</strong></div>` : ''}
          </div>`;
      });
    }

    html += `</div>

      <!-- COURSES -->
      <div style="margin-bottom:8px;font-size:16px;font-weight:700;color:var(--text);">📚 Courses</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;font-size:14px;">
          <thead>
            <tr style="background:var(--bg);color:var(--text2);font-size:12px;text-transform:uppercase;letter-spacing:.5px;">
              <th style="padding:12px 16px;text-align:left;">#</th>
              <th style="padding:12px 16px;text-align:left;">Course Name</th>
              <th style="padding:12px 16px;text-align:left;">Type</th>
              <th style="padding:12px 16px;text-align:left;">Duration</th>
              <th style="padding:12px 16px;text-align:left;">Seats</th>
              <th style="padding:12px 16px;text-align:left;">Enrolled</th>
              <th style="padding:12px 16px;text-align:left;">Department</th>
            </tr>
          </thead>
          <tbody>`;

    if (!courses.length) {
      html += `<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--text2);">No courses found for your department.</td></tr>`;
    } else {
      const typeColors = { UG: '#e3f0ff', PG: '#f3e5f5', Diploma: '#fff3e0', PhD: '#e8f5e9' };
      const typeText = { UG: '#2563eb', PG: '#6a1b9a', Diploma: '#d97706', PhD: '#15803d' };
      courses.forEach((c, i) => {
        html += `
          <tr style="border-top:1px solid var(--border);">
            <td style="padding:12px 16px;color:var(--text2);">${i + 1}</td>
            <td style="padding:12px 16px;font-weight:600;color:var(--text);">${c.name}</td>
            <td style="padding:12px 16px;">
              <span style="background:${typeColors[c.type] || '#e3f0ff'};color:${typeText[c.type] || '#2563eb'};border-radius:6px;padding:2px 8px;font-size:12px;font-weight:600;">${c.type || 'UG'}</span>
            </td>
            <td style="padding:12px 16px;color:var(--text2);">${c.duration || '—'}</td>
            <td style="padding:12px 16px;color:var(--text2);">${c.totalSeats ?? '—'}</td>
            <td style="padding:12px 16px;color:var(--text);">${c.studentCount ?? 0}</td>
            <td style="padding:12px 16px;color:var(--text2);">${c.department?.name || c.departmentName || '—'}</td>
          </tr>`;
      });
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;

  } catch (e) {
    container.innerHTML = `<div style="color:var(--red);padding:16px">Failed to load: ${e.message}</div>`;
  }
}

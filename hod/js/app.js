// hod/js/app.js — App Bootstrap, Profile, Navigation & Section Routing

/* ═══ BOOTSTRAP ═══ */
async function bootstrap() {
  showPageLoader(true);
  try {
    const me = await apiJson('/api/hod/me');
    // Support both flat and nested response
    const hod = me.hod || me.user || me;
    currentUsername = hod.username || hod._id || hod.id;
    currentHOD = {
      name: hod.name || '',
      department: typeof hod.department === 'object' ? (hod.department?.name || '') : (hod.department || ''),
      email: hod.email || '',
      phone: hod.phone || '',
      avatar: hod.avatar || '',
      emergencyContact: hod.emergencyContact || '',
      joined: hod.joinedDate || hod.joined || '',
      employeeId: hod.employeeId || hod.employee_id || '',
      courses: Array.isArray(hod.courses) ? hod.courses : [],
      semesterCount: hod.semesterCount || hod.semester_count || 6
    };
    HOD_COURSES = currentHOD.courses;
    SEM_COUNT = currentHOD.semesterCount;

    // Load subjects from API (or from HOD profile if embedded)
    if (hod.subjects && typeof hod.subjects === 'object' && Object.keys(hod.subjects).length > 0) {
      SUBJECTS = hod.subjects;
    } else {
      await refreshSubjects();
    }

    // Load courses from DB (reflects admin/super-admin changes)
    try {
      const courseData = await apiJson('/api/hod/courses');
      const dbCourses = (courseData.courses || []).map(c => c.name).filter(Boolean);
      if (dbCourses.length) {
        HOD_COURSES = [...new Set(dbCourses)];
      }
    } catch (e) {
      console.warn('Could not load courses from DB:', e.message);
    }

    // Load students + teachers in parallel
    await Promise.all([refreshStudents(), refreshTeachers()]);

    // If existing records use courses not yet in HOD_COURSES, add them so they remain visible.
    const studentCourses = [...new Set(allStudents.map(s => s.course).filter(Boolean))];
    const teacherCourses = [...new Set(allTeachers.map(t => t.course).filter(Boolean))];
    for (const c of [...studentCourses, ...teacherCourses]) {
      if (!HOD_COURSES.includes(c)) HOD_COURSES.push(c);
    }
    // Real courses found on existing student/teacher records are already merged in above.
    currentHOD.courses = HOD_COURSES;

    // Reset section state
    openSchedSem = {};
    HOD_COURSES.forEach(c => openSchedSem[c] = null);
    announcements = [];
    rptCourse = null; rptType = null; rptView = null; rptSem = null; rptDuration = '';
    annCourse = null; annSem = null; annTarget = 'students';

    // Update UI
    document.getElementById('sidebarDept').textContent = currentHOD.department || 'Department';
    document.getElementById('sidebarName').textContent = currentHOD.name || 'HOD';
    const sbAv = document.getElementById('sidebarAvatar');
    if (sbAv) {
      sbAv.innerHTML = currentHOD.avatar
        ? `<img src="${currentHOD.avatar}" alt="${currentHOD.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
        : (currentHOD.name || 'H').trim().slice(0, 1).toUpperCase();
    }
    updateProfile();
    loadDashboard();
  } catch (e) {
    console.error('Bootstrap failed:', e);
    showBootstrapError(e.message || 'Failed to load dashboard. Please log in again.');
  } finally {
    showPageLoader(false);
  }
}

function showPageLoader(show) {
  let el = document.getElementById('pageLoader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pageLoader';
    el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:3px;background:var(--accent,#4f9cf9);z-index:9999;transition:opacity .3s;';
    document.body.appendChild(el);
  }
  el.style.opacity = show ? '1' : '0';
}

function showBootstrapError(msg) {
  const main = document.querySelector('.main-content') || document.body;
  main.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;gap:16px;text-align:center;padding:24px;">
      <div style="font-size:48px;">⚠️</div>
      <div style="font-size:20px;font-weight:700;color:var(--text);">Unable to Load Dashboard</div>
      <div style="font-size:14px;color:var(--text2);max-width:400px;">${msg}</div>
      <button class="btn btn-primary" onclick="window.location.replace('/login')">Go to Login</button>
      <button class="btn btn-ghost" onclick="bootstrap()">Retry</button>
    </div>`;
}

bootstrap();

/* ═══ PROFILE PHOTO UPLOAD (spec item 3: photo is the only editable thing) ═══ */
let _hodPhotoUploading = false;
function uploadHodPhoto(evt) {
  const file = evt.target.files && evt.target.files[0];
  evt.target.value = '';
  if (!file || _hodPhotoUploading) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    showToast('Please choose a JPEG, PNG, or WEBP image.', true);
    return;
  }
  _hodPhotoUploading = true;
  const statusEl = document.getElementById('hodPhotoStatus');
  if (statusEl) statusEl.textContent = 'Uploading…';
  _compressImageTo100KB(file)
    .then(dataUri => apiJson('/api/hod/profile/photo', { method: 'POST', body: JSON.stringify({ image: dataUri }) }))
    .then(d => {
      currentHOD.avatar = (d.hod || d.user || d).avatar || '';
      updateProfile();
      if (statusEl) statusEl.textContent = '';
      showToast('Profile photo updated.');
    })
    .catch(e => { if (statusEl) statusEl.textContent = e.message || 'Upload failed.'; })
    .finally(() => { _hodPhotoUploading = false; });
}

function _compressImageTo100KB(file) {
  const MAX_BYTES = 100 * 1024;
  const attempts = [[480, 0.8], [480, 0.6], [360, 0.6], [360, 0.45], [280, 0.45], [280, 0.3], [200, 0.3], [160, 0.25]];
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Could not read the selected image.'));
      img.onload = () => {
        for (const [maxDim, quality] of attempts) {
          let { width, height } = img;
          if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          const uri = canvas.toDataURL('image/jpeg', quality);
          if (Math.floor(uri.length * 0.75) <= MAX_BYTES) return resolve(uri);
        }
        reject(new Error('This image is too detailed to compress under 100KB — please choose a simpler or smaller photo.'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ═══ PROFILE ═══ */
function updateProfile() {
  if (!currentHOD) return;
  const ini = currentHOD.name.split(' ').pop()[0] || 'H';
  const el = id => document.getElementById(id);
  if (el('profileInitial')) {
    el('profileInitial').innerHTML = currentHOD.avatar
      ? `<img src="${currentHOD.avatar}" alt="${currentHOD.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
      : ini;
  }
  if (el('profileName')) el('profileName').textContent = currentHOD.name;
  if (el('profileDeptLabel')) el('profileDeptLabel').textContent = 'Head of Department – ' + currentHOD.department;
  if (el('profileInfo')) el('profileInfo').innerHTML = `
    <div class="profile-row"><span>Email</span><span>${currentHOD.email}</span></div>
    <div class="profile-row"><span>Phone</span><span>${currentHOD.phone}</span></div>
    <div class="profile-row"><span>Emergency Contact</span><span>${currentHOD.emergencyContact || '—'}</span></div>
    <div class="profile-row"><span>Department</span><span>${currentHOD.department}</span></div>
    <div class="profile-row"><span>Courses</span><span>${currentHOD.courses.join(', ')}</span></div>
    <div class="profile-row"><span>Joined</span><span>${currentHOD.joined || '—'}</span></div>
    <div class="profile-row"><span>Employee ID</span><span>${currentHOD.employeeId || '—'}</span></div>
  `;
  if (el('darkOpt') && el('lightOpt')) {
    el('darkOpt').classList.toggle('active', currentTheme === 'dark');
    el('lightOpt').classList.toggle('active', currentTheme === 'light');
  }
}

/* ═══ NAVIGATION ═══ */
const SECTION_META = {
  dashboard:    { title: 'Dashboard',       sub: 'Department overview' },
  students:     { title: 'Students',        sub: 'Manage department students' },
  teachers:     { title: 'Teachers',        sub: 'Manage department faculty' },
  markattendance: { title: 'Mark Attendance', sub: 'View & manage attendance records by course, semester & subject' },
  schedule:     { title: 'Schedule',        sub: 'Semester-wise subject schedule with timings' },
  marksupload:  { title: 'Upload Marks',    sub: 'Upload Mid-Sem & GUT exam marks for your department' },
  reports:      { title: 'Reports',         sub: 'Attendance, Marks & Department reports — export to Excel' },
  announcement: { title: 'Announcements',   sub: 'Send messages to students or teachers' },
  cc:           { title: 'Class Coordinators', sub: 'Appoint CC per semester — they can view all student marks & attendance' },
  courses:      { title: 'Courses & Departments', sub: 'View dept & course info (managed by Admin / Super Admin)' },
  subjects:     { title: 'Subjects',        sub: 'Add and manage subjects for your department\'s courses & semesters' },
  cohodhistory: { title: 'Co-HOD History',  sub: 'Everything added, changed, or removed in your department, with who did it' },
  profile:      { title: 'Profile',         sub: 'Your account details and preferences' }
};

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === id));
  const m = SECTION_META[id] || {};
  const tt = document.getElementById('topTitle');
  const ts = document.getElementById('topSub');
  if (tt) tt.textContent = m.title || id;
  if (ts) ts.textContent = m.sub || '';
  const fns = {
    dashboard: loadDashboard,
    students: loadStudentsSection,
    teachers: loadTeachersSection,
    markattendance: loadMarkAttendance,
    schedule: loadSchedule,
    marksupload: loadMarksUpload,
    reports: loadReports,
    announcement: loadAnnouncements,
    cc: loadCCSection,
    courses: loadCoursesSection,
    subjects: (typeof loadSubjectsSection === 'function') ? loadSubjectsSection : undefined,
    cohodhistory: (typeof loadCoHodHistory === 'function') ? loadCoHodHistory : undefined,
  };
  if (fns[id]) fns[id]();
}

/* ═══ DATE ═══ */
function updateDate() {
  const d = new Date();
  const el = document.getElementById('topDate');
  if (el) el.textContent = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
updateDate();

// teacher/js/dashboard.js — Dashboard: stats, today's schedule, quick actions
// All data is fetched from the backend; no mock/static data is used here.

async function loadDashboard() {
  const now    = new Date();
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('heroDate').textContent =
    days[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();

  // Hero greeting from live profile
  document.getElementById('heroGreeting').textContent = 'Hello, ' + (currentTeacher.name.split(' ')[0] || 'Teacher') + ' 👋';
  document.getElementById('heroDept').textContent     = currentTeacher.dept + ' • Eadronix';

  // Stat cards — fetch totals from API
  try {
    const d = await TAPI.getStudents();
    const totalStu = d.success ? (d.totalStudents ?? (d.students ? d.students.length : 0)) : 0;
    document.getElementById('statStudents').textContent = totalStu;
  } catch (_) {
    document.getElementById('statStudents').textContent = '—';
  }
  document.getElementById('statSubjects').textContent = currentTeacher.assignedSubjects.length;
  // document.getElementById('statAtt').textContent      = attLogs.length;
  const sessions = new Set();

attLogs.forEach(a => {
    const day = new Date(a.date).toISOString().slice(0, 10);

    sessions.add(
        `${a.course}|${a.semester}|${a.subject}|${a.division}|${a.time}|${day}`
    );
});

document.getElementById('statAtt').textContent = sessions.size;
  document.getElementById('statSyl').textContent      = syllabusList.length;

  renderTodaySchedule();
}

function renderTodaySchedule() {
  const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()];
  const d       = DAYS.includes(dayName) ? dayName : 'Mon';
  const lecs    = currentTeacher.timetable[d] || [];
  const cont    = document.getElementById('todaySchedule');

  if (!lecs.length) {
    cont.innerHTML = `
      <div class="card" style="text-align:center;padding:36px 20px">
        <div style="font-size:40px;margin-bottom:10px">🎉</div>
        <div style="font-size:15px;font-weight:700;color:var(--muted)">No classes today!</div>
        <div style="font-size:12px;color:var(--muted2);margin-top:4px;font-weight:600">Enjoy your free time</div>
      </div>`;
    return;
  }

  cont.innerHTML = lecs.map(l => `
    <div class="sched-card">
      <div class="sched-time-badge">
        <div class="stb-time">${l.time}</div>
        <div class="stb-room">🏠 ${l.room}</div>
      </div>
      <div class="sched-info">
        <div class="sched-sub">${l.subject}</div>
        <div class="sched-meta">${l.course} · ${getSemSuffix(l.sem)} Sem</div>
        <span class="type-badge">${l.type}</span>
      </div>
      <button class="sched-mark-btn" onclick="quickMarkAtt('${l.course}',${l.sem},'${l.subject}')">Mark Att.</button>
    </div>`).join('');
}

function quickMarkAtt(course, sem, subject) {
  document.getElementById('attCourse').value = course;
  document.getElementById('attSem').value    = sem;
  onAttChange();
  setTimeout(() => { selectSubject(subject); }, 100);
  goToPage('attendance');
}

// teacher/js/navigation.js — Page routing & bottom/sidebar nav sync

function goToPage(id) {
  UI.show(id);
  if (id === 'home')          loadDashboard();
  if (id === 'schedule')      renderSchedulePage();
  if (id === 'announcements') Announcements.load();
  if (id === 'profile')       TeacherProfile.load();
  if (id === 'marks')         Marks.init();
}

function goToStudents() {
  goToPage('students');
  if (stuFilterCourse && stuFilterSem) renderStudentsGrid();
}

// ─── Schedule: day tabs ───
function showDaySchedule(day, clickedEl) {
  document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.day-schedule').forEach(d => d.classList.remove('active'));
  if (clickedEl) clickedEl.classList.add('active');
  const panel = document.getElementById('day-' + day);
  if (panel) panel.classList.add('active');
}

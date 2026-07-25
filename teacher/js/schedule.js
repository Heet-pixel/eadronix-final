// teacher/js/schedule.js — Weekly schedule page: render all days, tab switching

async function renderSchedulePage() {
  const cont = document.getElementById('scheduleCont');
  if (!cont) return;
  cont.innerHTML = `<div class="empty-state" style="padding:40px 20px"><div class="e-icon">⏳</div><div class="e-txt">Loading your schedule…</div></div>`;

  // Always fetch fresh — don't rely on the one-time snapshot taken at login,
  // since HOD may have added/changed lectures since then.
  try {
    const sd = await TAPI.getSchedule();
    if (sd.success && sd.timetable) currentTeacher.timetable = sd.timetable;
  } catch (_) {
    // fall through and render whatever we already have (possibly empty)
  }

  const timetable = currentTeacher.timetable;
  if (!timetable || !Object.keys(timetable).length) {
    cont.innerHTML = `
      <div class="empty-state" style="padding:40px 20px">
        <div class="e-icon">📅</div>
        <div class="e-txt">No timetable available</div>
        <div class="e-sub">Your schedule will appear here once it's assigned by admin</div>
      </div>`;
    return;
  }

  // Count weekly totals
  let totalSlots = 0;
  const subjectSet = new Set();
  DAYS.forEach(day => {
    const slots = timetable[day] || [];
    totalSlots += slots.length;
    slots.forEach(l => subjectSet.add(l.subject));
  });

  cont.innerHTML = `
    <div class="sched-summary">
      <div class="ss-item"><div class="ss-val">${totalSlots}</div><div class="ss-lbl">Weekly Lectures</div></div>
      <div class="ss-item"><div class="ss-val">${subjectSet.size}</div><div class="ss-lbl">Subjects</div></div>
      <div class="ss-item"><div class="ss-val">${Object.keys(timetable).length}</div><div class="ss-lbl">Active Days</div></div>
    </div>
    <div class="day-tabs">
      ${DAYS.map((day, i) => `
        <div class="day-tab${i === 0 ? ' active' : ''}" id="dtp-${day}" onclick="showDaySchedule('${day}', this)">${day}</div>
      `).join('')}
    </div>
    <div class="day-panels">
      ${DAYS.map((day, i) => {
        const slots = timetable[day] || [];
        return `
          <div class="day-schedule${i === 0 ? ' active' : ''}" id="day-${day}">
            ${slots.length
              ? slots.map(l => `
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
                  </div>`).join('')
              : `<div class="empty-state" style="padding:32px 20px">
                   <div class="e-icon">🎉</div>
                   <div class="e-txt">No classes on ${day}</div>
                 </div>`}
          </div>`;
      }).join('')}
    </div>`;
}

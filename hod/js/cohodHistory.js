// hod/js/cohodHistory.js — spec item 4
// "If any teacher is assigned as Co-HOD, the main HOD of that department
// will have a co-hod history — whatever changes/updates/work is done by
// the Co-HOD will be displayed to the HOD." This page reads the append-only
// activity log the backend writes to on every HOD-role action (subjects,
// schedule, announcements, student/teacher edits, appointments) and shows
// it as a simple timeline, tagging each entry with who did it.

async function loadCoHodHistory() {
  const el = document.getElementById('cohodHistoryContent');
  if (!el) return;
  el.innerHTML = '<div class="skeleton" style="height:200px;border-radius:10px"></div>';
  try {
    const data = await apiJson('/api/hod/co-hod-history');
    const entries = data.entries || [];
    if (!entries.length) {
      el.innerHTML = `<div class="card" style="text-align:center;color:var(--text3);padding:40px">No activity recorded yet. Actions taken by you or your Co-HOD (adding subjects, building schedules, posting announcements, editing students/teachers) will show up here.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="card">
        <div style="display:flex;flex-direction:column;gap:2px">
          ${entries.map(e => `
            <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border,#eee)">
              <div style="flex-shrink:0;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;
                          background:${e.actorRole === 'co_hod' ? '#fef3c7' : '#e0e7ff'};color:${e.actorRole === 'co_hod' ? '#92400e' : '#3730a3'}">
                ${e.actorRole === 'co_hod' ? '🧑‍🏫' : e.actorRole === 'admin' ? '🛡' : '👔'}
              </div>
              <div style="flex:1">
                <div style="font-size:13.5px">${_html(e.message)}</div>
                <div style="font-size:11.5px;color:var(--text3);margin-top:3px">
                  <span style="font-weight:600">${_html(e.actorName || 'Someone')}</span>
                  <span style="text-transform:uppercase;letter-spacing:.4px;margin-left:6px;padding:1px 6px;border-radius:4px;background:${e.actorRole === 'co_hod' ? '#fef3c7' : '#eef2ff'};color:${e.actorRole === 'co_hod' ? '#92400e' : '#3730a3'};font-size:10px">${e.actorRole === 'co_hod' ? 'Co-HOD' : e.actorRole?.toUpperCase() || 'HOD'}</span>
                  · ${fmtDateTime(e.createdAt)}
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div class="card" style="color:#dc2626">Failed to load history: ${_html(e.message)}</div>`;
  }
}

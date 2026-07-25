// ============================================================
//  student/js/timetable.js
//  Weekly timetable page
//  Expected API response shape:
//  {
//    success: true,
//    data: {
//      Mon: [ { time, subject, teacher, room, type } ],
//      Tue: [ ... ], Wed: [...], Thu: [...], Fri: [...], Sat: [...]
//    }
//  }
// ============================================================

const Timetable = {
  _data:    null,
  _activeDay: null,

  async load() {
    _el('tt-content').innerHTML = UI.skeleton(3, 70);
    try {
      const d = await API.student.timetable();
      if (!d.success) throw new Error(d.message || 'Failed');
      this._data = d.data || {};
      this._activeDay = this._todayKey();
      this._render();
    } catch (err) {
      _el('tt-content').innerHTML = UI.error(err.message);
    }
  },

  _todayKey() {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const key  = days[new Date().getDay()];
    return this._data?.[key] ? key : Object.keys(this._data || {})[0] || 'Mon';
  },

  switchDay(day, el) {
    this._activeDay = day;
    document.querySelectorAll('.day-chip').forEach(c => c.classList.toggle('day-chip--active', c.dataset.day === day));
    this._renderSlots();
  },

  _render() {
    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat'];
    const data  = this._data;

    if (!Object.keys(data).length) {
      _el('tt-content').innerHTML = UI.empty('📅', 'No timetable', 'Your timetable has not been set up yet.');
      return;
    }

    const chips = DAYS.filter(d => data[d]).map(d => `
      <div class="day-chip ${d === this._activeDay ? 'day-chip--active' : ''}"
           data-day="${d}" onclick="Timetable.switchDay('${d}', this)">${d}</div>
    `).join('');

    _el('tt-content').innerHTML = `
      <div class="day-chips" id="tt-day-chips">${chips}</div>
      <div id="tt-slots"></div>`;

    this._renderSlots();
  },

  _renderSlots() {
    const slots = this._data[this._activeDay] || [];
    const el    = document.getElementById('tt-slots');
    if (!el) return;

    if (!slots.length) {
      el.innerHTML = UI.empty('🎉', 'No classes', `No classes on ${this._activeDay}.`);
      return;
    }

    el.innerHTML = slots.map(s => `
      <div class="tt-card">
        <div class="tt-card__time">${s.time || '—'}</div>
        <div class="tt-card__body">
          <div class="tt-card__subject">${s.subject || '—'}</div>
          <div class="tt-card__meta">
            ${s.teacher ? `👤 ${s.teacher}` : ''}
            ${s.room    ? `· 🏠 ${s.room}`  : ''}
          </div>
          ${s.type ? `<span class="badge badge--type">${s.type}</span>` : ''}
        </div>
      </div>`).join('');
  },
};

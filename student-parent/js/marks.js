// ============================================================
//  student/js/marks.js
//  Internal marks / exam results page
//  Expected API response shape:
//  {
//    success: true,
//    data: [
//      {
//        subject: { name, code },
//        exams: [
//          { name: 'Mid-1', marksObtained: 22, totalMarks: 30, date }
//        ],
//        totalObtained: 22, totalMax: 30
//      }
//    ]
//  }
// ============================================================

const Marks = {
  _data: null,

  async load() {
    _el('marks-content').innerHTML = UI.skeleton(3, 100);
    try {
      const d = await API.student.marks();
      if (!d.success) throw new Error(d.message || 'Failed');
      this._data = d.data || [];
      this._render();
    } catch (err) {
      _el('marks-content').innerHTML = UI.error(err.message);
    }
  },

  _render() {
    const list = this._data;
    if (!list.length) {
      _el('marks-content').innerHTML = UI.empty('📝', 'No marks yet', 'Your exam results will appear here once uploaded by your teacher.');
      return;
    }

    _el('marks-content').innerHTML = list.map(s => {
      const pct  = s.totalMax > 0 ? Math.round(s.totalObtained / s.totalMax * 100) : 0;
      const col  = pct >= 75 ? 'var(--clr-success)' : pct >= 50 ? 'var(--clr-warning)' : 'var(--clr-danger)';
      const grade = this._grade(pct);

      return `
        <div class="marks-card">
          <div class="marks-card__header">
            <div>
              <div class="marks-card__subject">${s.subject?.name || '—'}</div>
              <div class="marks-card__code">${s.subject?.code || ''}</div>
            </div>
            <div class="marks-card__total" style="color:${col}">
              ${s.totalObtained}/${s.totalMax}
              <span class="marks-grade" style="background:${col}20;color:${col}">${grade}</span>
            </div>
          </div>

          <div class="marks-bar-track">
            <div class="marks-bar-fill" style="width:${pct}%;background:${col}"></div>
          </div>

          ${s.exams?.length ? `
            <div class="exam-list">
              ${s.exams.map(ex => `
                <div class="exam-row">
                  <span class="exam-row__name">${ex.name}</span>
                  <span class="exam-row__date">${ex.date ? UI.date(ex.date) : ''}</span>
                  <span class="exam-row__score" style="color:${col}">
                    ${ex.marksObtained} / ${ex.totalMarks}
                  </span>
                </div>`).join('')}
            </div>` : ''}
        </div>`;
    }).join('');
  },

  _grade(pct) {
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B+';
    if (pct >= 60) return 'B';
    if (pct >= 50) return 'C';
    if (pct >= 40) return 'D';
    return 'F';
  },
};

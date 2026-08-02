// ============================================================
//  student/js/marks.js
//  Internal marks / exam results page
//
//  Merges two sources so a subject shows up even before any exam
//  has been entered for it yet:
//   - API.student.subjects()  → every subject the student is enrolled in
//   - API.student.marks()     → every Mark row visible to this student
//     (published teacher/CC entries, plus the student's own self-uploaded
//     marksheet screenshots — see backend studentBundle() filter)
//
//  Each exam row can be in one of three states:
//   - numeric marks, published        → shown as a normal score
//   - self-uploaded image, no number  → shown as "Uploaded — pending review"
//     with a thumbnail/link to the screenshot
//   - nothing yet                     → not shown as a row; the subject
//     card just offers the "Upload your marksheet" action
// ============================================================

const Marks = {
  _subjects: [],
  _bySubject: {},

  async load() {
    _el('marks-content').innerHTML = UI.skeleton(3, 100);
    try {
      const [subjRes, marksRes] = await Promise.all([
        API.student.subjects(),
        API.student.marks(),
      ]);
      if (!marksRes.success) throw new Error(marksRes.message || 'Failed');
      this._subjects = (subjRes && subjRes.success && subjRes.subjects) || subjRes?.data || [];
      this._bySubject = {};
      (marksRes.data || []).forEach((s) => {
        const key = String(s.subject?._id || s.subject?.name);
        this._bySubject[key] = s;
      });
      this._render();
    } catch (err) {
      _el('marks-content').innerHTML = UI.error(err.message);
    }
  },

  _isParent() {
    return !!(window.SAL_USER && window.SAL_USER.role === 'parent');
  },

  _render() {
    // Union of subjects we're enrolled in + any subject that already has a
    // mark row but somehow isn't in the enrolled-subjects list (edge case:
    // a subject from an earlier semester).
    const seen = new Set();
    const cards = [];

    const subjectList = this._subjects.length
      ? this._subjects
      : Object.values(this._bySubject).map((s) => s.subject);

    for (const subj of subjectList) {
      const key = String(subj?._id || subj?.name);
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(this._renderCard(subj, this._bySubject[key]));
    }
    // Any leftover subject that appeared only in marks data (not enrolled list)
    for (const key in this._bySubject) {
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(this._renderCard(this._bySubject[key].subject, this._bySubject[key]));
    }

    if (!cards.length) {
      _el('marks-content').innerHTML = UI.empty('📝', 'No marks yet', 'Your exam results will appear here once uploaded by your teacher.');
      return;
    }
    _el('marks-content').innerHTML = cards.join('');
  },

  _renderCard(subject, data) {
    const exams = data?.exams || [];
    const hasScored = exams.some((e) => typeof e.marksObtained === 'number');
    const pct = hasScored && data.totalMax > 0 ? Math.round(data.totalObtained / data.totalMax * 100) : null;
    const col = pct === null ? 'var(--clr-text2)' : pct >= 75 ? 'var(--clr-success)' : pct >= 50 ? 'var(--clr-warning)' : 'var(--clr-danger)';
    const grade = pct === null ? '—' : this._grade(pct);
    const subjKey = subject?._id || '';

    return `
      <div class="marks-card">
        <div class="marks-card__header">
          <div>
            <div class="marks-card__subject">${subject?.name || '—'}</div>
            <div class="marks-card__code">${subject?.code || ''}</div>
          </div>
          <div class="marks-card__total" style="color:${col}">
            ${pct === null ? 'No score yet' : `${data.totalObtained}/${data.totalMax}`}
            ${pct === null ? '' : `<span class="marks-grade" style="background:${col}20;color:${col}">${grade}</span>`}
          </div>
        </div>

        ${pct === null ? '' : `
          <div class="marks-bar-track">
            <div class="marks-bar-fill" style="width:${pct}%;background:${col}"></div>
          </div>`}

        ${exams.length ? `
          <div class="exam-list">
            ${exams.map((ex) => this._renderExamRow(ex)).join('')}
          </div>` : ''}

        ${this._isParent() ? '' : `
          <button class="marks-upload-btn" onclick="Marks.promptUpload('${subjKey}', '${(subject?.name || '').replace(/'/g, "\\'")}')">
            📤 Upload your marksheet
          </button>`}
      </div>`;
  },

  _renderExamRow(ex) {
    const hasNumber = typeof ex.marksObtained === 'number';
    if (hasNumber) {
      const pct = ex.totalMarks > 0 ? Math.round(ex.marksObtained / ex.totalMarks * 100) : 0;
      const col = pct >= 75 ? 'var(--clr-success)' : pct >= 50 ? 'var(--clr-warning)' : 'var(--clr-danger)';
      return `
        <div class="exam-row">
          <span class="exam-row__name">${ex.name}</span>
          <span class="exam-row__date">${ex.date ? UI.date(ex.date) : ''}</span>
          <span class="exam-row__score" style="color:${col}">
            ${ex.marksObtained} / ${ex.totalMarks}
          </span>
          ${ex.image ? `<a href="${ex.image}" target="_blank" class="exam-row__proof" title="View your uploaded marksheet">🖼️</a>` : ''}
        </div>`;
    }
    if (ex.image) {
      return `
        <div class="exam-row exam-row--pending">
          <span class="exam-row__name">${ex.name}</span>
          <span class="exam-row__date">${ex.imageUploadedAt ? UI.date(ex.imageUploadedAt) : ''}</span>
          <a href="${ex.image}" target="_blank" class="exam-row__score exam-row__score--pending">
            🖼️ Uploaded — pending review
          </a>
        </div>`;
    }
    return '';
  },

  // ── Self-upload flow ──
  _pendingSubject: null,

  promptUpload(subjectId, subjectName) {
    this._pendingSubject = subjectId;
    const overlay = document.createElement('div');
    overlay.className = 'marks-upload-overlay';
    overlay.innerHTML = `
      <div class="marks-upload-modal">
        <div class="marks-upload-modal__title">Upload marksheet — ${subjectName}</div>
        <label class="marks-upload-modal__label">Exam / test name</label>
        <input type="text" id="markUploadExamType" placeholder="e.g. Mid Sem 1, Unit Test 2" class="marks-upload-modal__input">
        <label class="marks-upload-modal__label">Screenshot of your marksheet</label>
        <input type="file" id="markUploadFile" accept="image/*" class="marks-upload-modal__input">
        <div class="marks-upload-modal__actions">
          <button class="marks-upload-modal__cancel" onclick="Marks.closeUpload()">Cancel</button>
          <button class="marks-upload-modal__submit" onclick="Marks.submitUpload()">Upload</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    this._overlay = overlay;
  },

  closeUpload() {
    this._overlay?.remove();
    this._overlay = null;
    this._pendingSubject = null;
  },

  async submitUpload() {
    const examType = document.getElementById('markUploadExamType')?.value.trim();
    const fileInput = document.getElementById('markUploadFile');
    const file = fileInput?.files?.[0];
    if (!examType) return UI.toast('Enter the exam/test name.', 'error');
    if (!file) return UI.toast('Choose a screenshot to upload.', 'error');
    if (file.size > 8 * 1024 * 1024) return UI.toast('Image is too large (max 8MB).', 'error');

    try {
      const dataUri = await this._readAsDataUri(file);
      const res = await API.student.uploadMarkImage(this._pendingSubject, examType, dataUri);
      if (!res.success) throw new Error(res.message || 'Upload failed');
      UI.toast('Marksheet uploaded.');
      this.closeUpload();
      this.load();
    } catch (err) {
      UI.toast(err.message || 'Upload failed', 'error');
    }
  },

  _readAsDataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });
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

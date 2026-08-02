// teacher/js/marks.js — "Add Marks" page.
//
// A normal teacher only ever sees/edits the ONE subject column they teach
// for a given course+semester. A teacher appointed Class Coordinator (CC)
// for that course+semester (see hod/js/cc.js) sees every subject in that
// semester as its own column, for every student — plus the ability to
// "send marks to students" (publish) once the sheet is ready.
//
// A cell can arrive already containing a student's own self-uploaded
// marksheet screenshot (no number yet) — shown as a small camera icon the
// teacher can click to view, alongside the input to finalize a real score.

const Marks = {
  _course: "",
  _sem: 0,
  _examType: "",
  _isCC: false,
  _subjects: [],
  _students: [],
  _marksByKey: {}, // `${studentId}__${subjectId}` -> mark doc

  async init() {
    if (!myTeacherClasses.length && !(currentTeacher.ccAssignments || []).length) {
      // app.js's init() may not have finished populating these yet if the
      // user navigates here immediately — fetch fresh rather than showing
      // an empty dropdown.
      try {
        const [myCd, me] = await Promise.all([TAPI.getMyClasses(), TAPI.me()]);
        if (myCd.success) myTeacherClasses = myCd.classes || [];
        if (me.success && me.user) currentTeacher.ccAssignments = me.user.ccAssignments || [];
      } catch (_) {}
    }
    this._populateClassDropdown();
  },

  _populateClassDropdown() {
    // Union of classes this teacher actually teaches + classes they're CC for.
    const byCourse = new Map();
    (myTeacherClasses || []).forEach((c) => {
      if (!byCourse.has(c.course)) byCourse.set(c.course, new Set());
      (c.semesters || []).forEach((s) => byCourse.get(c.course).add(s));
    });
    (currentTeacher.ccAssignments || []).forEach((a) => {
      if (!a.course || !a.semester) return;
      if (!byCourse.has(a.course)) byCourse.set(a.course, new Set());
      byCourse.get(a.course).add(Number(a.semester));
    });

    const courseSel = document.getElementById("marksCourse");
    const prev = courseSel.value;
    courseSel.innerHTML =
      '<option value="">— Course —</option>' +
      [...byCourse.keys()].map((c) => `<option ${c === prev ? "selected" : ""}>${c}</option>`).join("");
    this._byCourse = byCourse;
  },

  onClassChange() {
    const course = document.getElementById("marksCourse").value;
    const sem = Number(document.getElementById("marksSem").value);
    this._course = course;
    this._sem = sem;
    document.getElementById("marksGridSec").style.display = "none";
    document.getElementById("marksPlaceholder").style.display = "";
    const note = document.getElementById("marksAccessNote");
    note.style.display = "none";

    if (!course || !sem) return;

    TAPI.getMarksAccess(course, sem).then((res) => {
      if (!res.success) return;
      this._isCC = res.isCC;
      note.style.display = "";
      note.className = "cc-note" + (res.isCC ? " cc-note--active" : "");
      note.textContent = res.isCC
        ? `👑 You're Class Coordinator for ${course} Sem ${sem} — you can view & edit marks for ALL subjects in this semester.`
        : res.subjects.length
          ? `You can add marks for your subject: ${res.subjects.map((s) => s.name).join(", ")}.`
          : "You aren't assigned to teach any subject in this semester.";
      this.onExamTypeChange();
    });
  },

  onExamTypeChange() {
    clearTimeout(this._examTypeDebounce);
    this._examTypeDebounce = setTimeout(() => {
      const examType = document.getElementById("marksExamType").value.trim();
      this._examType = examType;
      if (!this._course || !this._sem || !examType) return;
      this._loadGrid();
    }, 450);
  },

  async _loadGrid() {
    const res = await TAPI.getMarksGrid(this._course, this._sem, this._examType);
    if (!res.success) {
      showToast(res.message || "Could not load marks grid.", "error");
      return;
    }
    this._subjects = res.subjects || [];
    this._students = res.students || [];
    this._isCC = res.isCC;
    this._marksByKey = {};
    (res.marks || []).forEach((m) => {
      this._marksByKey[`${m.student}__${m.subject}`] = m;
    });

    document.getElementById("marksPlaceholder").style.display = this._subjects.length ? "none" : "";
    document.getElementById("marksGridSec").style.display = this._subjects.length ? "" : "none";
    document.getElementById("marksGridSub").textContent = this._isCC
      ? `All subjects — ${this._course} Sem ${this._sem}`
      : `Your subject — ${this._course} Sem ${this._sem}`;

    this._renderTable();
  },

  _renderTable() {
    const table = document.getElementById("marksGridTable");
    if (!this._students.length || !this._subjects.length) {
      table.innerHTML = `<tr><td>No students/subjects found for this class.</td></tr>`;
      return;
    }
    const head = `
      <tr>
        <th class="marks-grid-th-student">Student</th>
        ${this._subjects.map((s) => `<th>${s.name}${s.code ? `<div class="marks-grid-code">${s.code}</div>` : ""}</th>`).join("")}
      </tr>`;
    const rows = this._students
      .map((stu) => {
        const cells = this._subjects
          .map((subj) => {
            const key = `${stu._id}__${subj._id}`;
            const m = this._marksByKey[key];
            const val = m && typeof m.marks === "number" ? m.marks : "";
            const proof = m && m.image
              ? `<a href="${m.image}" target="_blank" title="View student-uploaded screenshot" class="marks-grid-proof">🖼️</a>`
              : "";
            const published = m && m.published ? '<span class="marks-grid-pub" title="Sent to student">✓</span>' : "";
            return `<td>
              <div class="marks-grid-cell">
                <input type="number" min="0" max="100" placeholder="—" value="${val}"
                  data-student="${stu._id}" data-subject="${subj._id}" class="marks-grid-input">
                ${proof}${published}
              </div>
            </td>`;
          })
          .join("");
        return `<tr><td class="marks-grid-td-student">${stu.name}<div class="marks-grid-roll">${stu.roll || ""}</div></td>${cells}</tr>`;
      })
      .join("");
    table.innerHTML = head + rows;
  },

  async save() {
    const inputs = document.querySelectorAll(".marks-grid-input");
    const records = [];
    inputs.forEach((inp) => {
      if (inp.value === "") return; // don't overwrite untouched cells with blanks
      records.push({
        student: inp.dataset.student,
        subject: inp.dataset.subject,
        examType: this._examType,
        marks: Number(inp.value),
        maxMarks: 100,
        course: this._course,
        semester: this._sem,
      });
    });
    if (!records.length) return showToast("Enter at least one mark first.", "error");
    const res = await TAPI.saveMarksGrid(records);
    if (!res.success) return showToast(res.message || "Save failed.", "error");
    showToast(res.message || `${res.saved} mark(s) saved.`);
    this._loadGrid();
  },

  async publish(publish) {
    if (!this._course || !this._sem || !this._examType) return;
    const res = await TAPI.publishMarks(this._course, this._sem, this._examType, publish);
    if (!res.success) return showToast(res.message || "Action failed.", "error");
    showToast(res.message);
    this._loadGrid();
  },
};

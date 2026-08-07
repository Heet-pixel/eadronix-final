// hod/js/attendance.js — Attendance Module: Mark, Save, Export, History
//
// NOTE: This file used to contain a second, entirely unused "Attendance"
// screen (loadAttendance/renderAttPage/toggleAttCard/markAllAtt/saveAttendance)
// left over from an earlier build. It was never wired to any nav item or DOM
// element (no #attContent exists in hod/index.html, no nav-item has
// data-page="attendance") — dead code, removed. The one real, reachable
// screen is "Mark Attendance" (nav-item data-page="markattendance"), which
// now follows the SAME step-by-step flow as the Teacher portal's attendance
// screen: Select Class → Select Subject → Mark Students (card grid) → Confirm.

/* ═══ STATE ═══ */
let savedAttendance = {}; // local cache used to keep report %s in sync after a save

// Mark Attendance state
let maAttCourse = "",
  maAttSem = "",
  maAttSubject = "",
  maAttDate = "",
  maAttTopic = "",
  maAttProxy = false;
let maAttStart = "09:00",
  maAttEnd = "09:30",
  maAttDivision = "";
let maAttType = "Theory"; // 'Theory' (1hr default) or 'Practical' (2hr default) — same rule as the Teacher portal
let maAttEndManuallySet = false; // true once the HOD edits End Time directly — stops us overwriting their choice
let maAttRecords = {}; // { studentId: 'P' | 'A' }
let maStep = 1;

// ═══════════════════════════════════════════════════════════
// Practical/Lab roll-number batching (mirrors teacher/js/attendance.js) —
// lets the HOD scope a Practical attendance session to only one roll-number
// range (e.g. 1-21) instead of the whole class, so multiple lab batches of
// the same course/semester can be marked separately without overlap.
// "All Students" (default, and the only option for Theory) keeps the
// original whole-class behaviour unchanged.
// ═══════════════════════════════════════════════════════════
let maAttAllStudents = true;
let maAttRollStart = "";
let maAttRollEnd = "";

/**
 * _todayIsoDateString()
 * -----------------------
 * Returns today's date as "YYYY-MM-DD", the format an HTML date input's
 * `max` attribute expects. Used to stop the HOD from picking a future date
 * when marking attendance — a lecture that hasn't happened yet can't have
 * attendance taken for it.
 */
function _todayIsoDateString() {
  return new Date().toISOString().split("T")[0];
}

// Names in this system are stored "Surname GivenName FatherName" (e.g.
// "Shah Heet Sahishkumar"), so the first word is the SURNAME, not what the
// student actually goes by. While marking attendance we want the given
// name — the second word — falling back to the first word for a
// single-word name. (Mirrors teacher/js/attendance.js's givenNameOf().)
function givenNameOf(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[1] || parts[0] || "";
}

// Roll badge: show only the LAST THREE characters of a roll number (e.g.
// "253060601049" -> "049") so long college roll numbers stay readable.
// Shorter rolls are zero-padded to 3 digits ("7" -> "007"). (Mirrors
// teacher/js/attendance.js's lastThreeOfRoll().)
function lastThreeOfRoll(roll) {
  const r = String(roll || "").trim();
  if (!r) return "";
  return r.length <= 3 ? r.padStart(3, "0") : r.slice(-3);
}

// Numeric-aware roll comparator, so "2" sorts before "10" (ascending order).
// (Mirrors teacher/js/attendance.js's compareRoll().)
function compareRoll(a, b) {
  const av = String(a || "").trim(),
    bv = String(b || "").trim();
  return av.localeCompare(bv, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

// Is `roll` within [start, end] (numeric-aware, order-independent)?
// (Mirrors teacher/js/attendance.js's rollInRange().)
function rollInRange(roll, start, end) {
  if (!start && !end) return true;
  const value = String(roll || "").trim();
  const from = String(start || "").trim();
  const to = String(end || "").trim();
  if (!value || !from || !to) return false;
  if (/^\d+$/.test(value) && /^\d+$/.test(from) && /^\d+$/.test(to)) {
    const n = Number(value),
      a = Number(from),
      b = Number(to);
    return n >= Math.min(a, b) && n <= Math.max(a, b);
  }
  const low =
    from.localeCompare(to, undefined, { numeric: true }) <= 0 ? from : to;
  const high = low === from ? to : from;
  return (
    value.localeCompare(low, undefined, { numeric: true }) >= 0 &&
    value.localeCompare(high, undefined, { numeric: true }) <= 0
  );
}

// All distinct, ascending-sorted roll numbers enrolled in a course+sem —
// backs both the Start/End roll <select> dropdowns and the roll-range
// filter itself, so they can never disagree about who's enrolled.
function getClassRollNumbers(course, sem) {
  const students = allStudents.filter(
    (s) => s.course === course && String(s.sem) === String(sem),
  );
  const rolls = [
    ...new Set(
      students.map((s) => String(s.roll || "").trim()).filter(Boolean),
    ),
  ];
  return rolls.sort((a, b) => compareRoll(a, b));
}

// <option> markup for the Start/End roll <select> — spec: the HOD must
// SELECT an existing roll number, never type one freehand.
function maRollOptionsHtml(selectedVal) {
  const rolls = getClassRollNumbers(maAttCourse, maAttSem);
  const placeholder = rolls.length
    ? '<option value="">-- Select Roll --</option>'
    : '<option value="">No students found</option>';
  return (
    placeholder +
    rolls
      .map(
        (r) =>
          `<option value="${escHtml(r)}" ${selectedVal === r ? "selected" : ""}>${escHtml(r)}</option>`,
      )
      .join("")
  );
}

// The class roster for the currently selected course+sem, ascending by
// roll number, narrowed to the chosen roll range when marking a Practical
// with "All Students" unchecked. Single source of truth used everywhere
// the Step 3 grid, stats, mark-all, confirm and save need "who's in scope".
function getMaClassStudents() {
  let students = allStudents.filter(
    (s) => s.course === maAttCourse && String(s.sem) === String(maAttSem),
  );
  students = students
    .slice()
    .sort((a, b) => compareRoll(a.roll || "", b.roll || ""));
  if (
    maAttType === "Practical" &&
    !maAttAllStudents &&
    maAttRollStart &&
    maAttRollEnd
  ) {
    students = students.filter((s) =>
      rollInRange(s.roll || "", maAttRollStart, maAttRollEnd),
    );
  }
  return students;
}

// Whether Practical + roll-range mode is on but the range hasn't been
// fully picked yet — used to block the grid/submit with a clear message
// instead of silently falling back to "whole class".
function maRollRangeIncomplete() {
  return (
    maAttType === "Practical" &&
    !maAttAllStudents &&
    (!maAttRollStart || !maAttRollEnd)
  );
}

/**
 * toggleMaAllStudents(checked)
 * -------------------------------
 * Fires when the HOD (un)checks "All Students" under a Practical session.
 * Unchecking reveals the Start/End roll pickers; checking clears any
 * chosen range and returns to whole-class marking.
 */
function toggleMaAllStudents(checked) {
  maAttAllStudents = checked;
  if (checked) {
    maAttRollStart = "";
    maAttRollEnd = "";
  }
  renderMarkAttPage();
}

function onMaRollStartChange(val) {
  maAttRollStart = val;
  normalizeMaRollRange();
  renderMarkAttPage();
}

function onMaRollEndChange(val) {
  maAttRollEnd = val;
  normalizeMaRollRange();
  renderMarkAttPage();
}

// If start > end (picked in the wrong order), swap them so the stored/used
// range is always ascending.
function normalizeMaRollRange() {
  if (
    /^\d+$/.test(maAttRollStart) &&
    /^\d+$/.test(maAttRollEnd) &&
    Number(maAttRollStart) > Number(maAttRollEnd)
  ) {
    [maAttRollStart, maAttRollEnd] = [maAttRollEnd, maAttRollStart];
  }
}

/**
 * _maCalcEndTime(start, type)
 * -----------------------------
 * Same rule the Teacher portal's autoSetEndTime() uses: Theory/Lecture ->
 * start + 1 hour, Practical -> start + 2 hours. Returns '' if it can't be
 * computed (no start time, or an unrecognised type).
 */
function _maCalcEndTime(start, type) {
  if (!start) return "";
  const [h, m] = start.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const addMin = type === "Theory" ? 60 : type === "Practical" ? 120 : 0;
  if (!addMin) return "";
  const total = h * 60 + m + addMin;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

/**
 * onMaTypeChange(newType)
 * -------------------------
 * Fires when the HOD picks Theory/Lecture vs Practical. Recomputes End Time
 * from the current Start Time using the same duration rule the Teacher
 * portal uses (1hr Theory / 2hr Practical) — re-asserting the expected
 * duration for the newly-chosen type, same as switching Type does in the
 * Teacher portal.
 */
function onMaTypeChange(newType) {
  maAttType = newType;
  const computed = _maCalcEndTime(maAttStart, newType);
  if (computed) maAttEnd = computed;
  maAttEndManuallySet = false;
  if (newType !== "Practical") {
    // Roll-range batching only applies to Practicals — same rule as the
    // Teacher portal's onAttTypeChange().
    maAttAllStudents = true;
    maAttRollStart = "";
    maAttRollEnd = "";
  }
  renderMarkAttPage();
}

/**
 * onMaStartTimeChange(newStart)
 * -------------------------------
 * Fires when the HOD edits Start Time. Auto-fills End Time to Start +
 * 1 hour (Theory) or Start + 2 hours (Practical) — the same rule the
 * Teacher portal's attendance screen uses — so the two fields stay in sync
 * by default instead of drifting apart. Once the HOD manually edits End
 * Time themselves, we stop overwriting it (maAttEndManuallySet), same
 * pattern as the Schedule module's autoCalcSlotEnd().
 */
function onMaStartTimeChange(newStart) {
  maAttStart = newStart;
  if (!maAttEndManuallySet) {
    const computed = _maCalcEndTime(newStart, maAttType);
    if (computed) {
      maAttEnd = computed;
      // Patch the End Time field's value directly instead of calling
      // renderMarkAttPage() — a full re-render replaces the <input>
      // element itself, which yanks keyboard focus away from Start Time
      // mid-edit (a native <input type="time"> fires "change" as soon as
      // each segment — hour, then minute — is completed, not only on
      // blur). Nothing else on screen depends on the time fields, so no
      // re-render is needed at all here.
      const endInput = document.getElementById("maAttEndTimeInput");
      if (endInput) endInput.value = maAttEnd;
    }
  }
}

function onMaEndTimeChange(newEnd) {
  maAttEnd = newEnd;
  maAttEndManuallySet = true; // HOD took control — never auto-overwrite again this session
  // No re-render here either, for the same reason as onMaStartTimeChange —
  // keeps focus in the End Time field while the HOD is still typing it.
}

/**
 * _validateMaTiming()
 * ----------------------
 * Single source of truth for the "is this a valid lecture time range" check
 * used by both prepareMaConfirm() (Step 4 preview) and saveMarkAttendance()
 * (final submit) — previously duplicated in both places. Handles the two
 * distinct failure cases with distinct messages (end before/equal to start,
 * vs. end too soon after start) instead of lumping both under one generic
 * "must be 30 minutes" message.
 * Returns { ok: true } or { ok: false, message }.
 */
function _validateMaTiming() {
  if (!maAttStart || !maAttEnd) return { ok: true }; // both optional — nothing to check
  const [startHour, startMinute] = maAttStart.split(":").map(Number);
  const [endHour, endMinute] = maAttEnd.split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) {
    return { ok: false, message: "Please enter a valid start and end time." };
  }
  const durationInMinutes =
    endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (durationInMinutes <= 0) {
    return { ok: false, message: "End time must be after start time." };
  }
  if (durationInMinutes < 30) {
    return {
      ok: false,
      message: "A lecture must be at least 30 minutes long.",
    };
  }
  return { ok: true };
}

function refreshStuReportsFromAtt() {
  allStudents.forEach((stu) => {
    let rpt = stuReports.find((r) => String(r.id) === String(stu.id));
    if (!rpt) return;
    let subjNames = getSubjNames(stu.course, stu.sem);
    rpt.subjects = subjNames.map((subName) => {
      let dates = Object.keys(
        ((savedAttendance[stu.course] || {})[stu.sem] || {})[subName] || {},
      );
      if (!dates.length) {
        let ex = rpt.subjects.find((s) => s.subject === subName);
        return ex || { subject: subName, total: 0, attended: 0, pct: 0 };
      }
      let total = dates.length;
      let attended = dates.filter(
        (d) =>
          (savedAttendance[stu.course][stu.sem][subName][d] || {})[stu.id] ===
          "P",
      ).length;
      let pct = total > 0 ? Math.round((attended / total) * 100) : 100;
      return { subject: subName, total, attended, pct };
    });
    let ot = rpt.subjects.reduce((a, b) => a + b.total, 0) || 1;
    let oa = rpt.subjects.reduce((a, b) => a + b.attended, 0);
    rpt.overallTotal = ot;
    rpt.overallAtt = oa;
    rpt.percentage = Math.round((oa / ot) * 100);
    rpt.status = rpt.percentage >= 75 ? "Regular" : "Shortage";
  });
}

// ═══════════════════════════════════════════════════════════
// MARK ATTENDANCE — Stepper flow (mirrors Teacher portal exactly):
//   Step 1: Select Class (Course, Semester, Date, Start/End time, Division, Topic)
//   Step 2: Select Subject (chip picker, + Proxy toggle)
//   Step 3: Mark Students (card grid, tap to toggle Present ↔ Absent)
//   Step 4: Confirm & Save (review numbers, then submit)
// ═══════════════════════════════════════════════════════════

/** Called when navigating to "Mark Attendance" section */
function loadMarkAttendance() {
  maAttCourse = "";
  maAttSem = "";
  maAttSubject = "";
  maAttTopic = "";
  maAttProxy = false;
  maAttDivision = "";
  maAttDate = new Date().toISOString().split("T")[0]; // default: today
  maAttStart = "09:00";
  maAttEnd = "09:30";
  maAttType = "Theory";
  maAttEndManuallySet = false;
  maAttAllStudents = true;
  maAttRollStart = "";
  maAttRollEnd = "";
  maAttRecords = {};
  maStep = 1;
  renderMarkAttPage();
}

/** Updates the visual stepper (step1..step4) based on how far along the HOD is */
function updateMaStepper() {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById("maStep" + i);
    if (!el) continue;
    el.classList.remove("active", "done");
    if (i < maStep) el.classList.add("done");
    else if (i === maStep) el.classList.add("active");
  }
}

function maStepperHTML() {
  return `<div class="ma-stepper" id="maStepper">
    <div class="ma-step-item" id="maStep1"><div class="ma-step-num">1</div><span class="ma-step-label">Select Class</span></div>
    <div class="ma-step-sep"></div>
    <div class="ma-step-item" id="maStep2"><div class="ma-step-num">2</div><span class="ma-step-label">Select Subject</span></div>
    <div class="ma-step-sep"></div>
    <div class="ma-step-item" id="maStep3"><div class="ma-step-num">3</div><span class="ma-step-label">Mark Students</span></div>
    <div class="ma-step-sep"></div>
    <div class="ma-step-item" id="maStep4"><div class="ma-step-num">4</div><span class="ma-step-label">Confirm</span></div>
  </div>`;
}

/** Render the full Mark Attendance page: stepper + whichever steps are unlocked so far */
function renderMarkAttPage() {
  // Determine how far the HOD has progressed, purely from state (course/sem -> subject -> ready)
  maStep = !maAttCourse || !maAttSem ? 1 : !maAttSubject ? 2 : 3;

  let courseOpts = HOD_COURSES.map(
    (c) =>
      `<option value="${c}" ${maAttCourse === c ? "selected" : ""}>${c}</option>`,
  ).join("");
  let semOpts = '<option value="">-- Semester --</option>';
  for (let s = 1; s <= SEM_COUNT; s++)
    semOpts += `<option value="${s}" ${maAttSem == s ? "selected" : ""}>Semester ${s}</option>`;

  let html = `<div class="att-mark-section">
    <div class="att-mark-header">
      <div class="att-mark-title">📋 Mark Attendance</div>
      <button class="btn btn-ghost btn-sm" onclick="HodAttHistory.open()">🕘 Attendance History</button>
    </div>

    ${maStepperHTML()}

    <!-- ── Step 1: Select Class ── -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><span class="ct-icon">🎯</span> Step 1 — Select Class</div>
      <div class="att-controls">
        <div class="att-ctrl-group">
          <label>Course</label>
          <select onchange="maAttCourse=this.value;maAttSem='';maAttSubject='';maAttRecords={};renderMarkAttPage()">
            <option value="">-- Course --</option>${courseOpts}
          </select>
        </div>
        <div class="att-ctrl-group">
          <label>Semester</label>
          <select onchange="maAttSem=this.value;maAttSubject='';maAttRecords={};renderMarkAttPage()" ${!maAttCourse ? "disabled" : ""}>
            ${semOpts}
          </select>
        </div>
        <div class="att-ctrl-group">
          <label>Date</label>
          <input type="date" value="${maAttDate}" max="${_todayIsoDateString()}" onchange="maAttDate=this.value;maAttRecords={};renderMarkAttPage()">
        </div>
        <div class="att-ctrl-group">
          <label>Type</label>
          <select onchange="onMaTypeChange(this.value)">
            <option value="Theory" ${maAttType === "Theory" ? "selected" : ""}>Theory / Lecture</option>
            <option value="Practical" ${maAttType === "Practical" ? "selected" : ""}>Practical</option>
          </select>
        </div>
        <div class="att-ctrl-group">
          <label>Start Time</label>
          <input id="maAttStartTimeInput" type="time" value="${maAttStart}" onchange="onMaStartTimeChange(this.value)">
        </div>
        <div class="att-ctrl-group">
          <label>End Time</label>
          <input id="maAttEndTimeInput" type="time" value="${maAttEnd}" onchange="onMaEndTimeChange(this.value)">
        </div>
        <div class="att-ctrl-group">
          <label>Division (optional)</label>
          <input type="text" value="${escHtml(maAttDivision || "")}" placeholder="e.g. A" oninput="maAttDivision=this.value">
        </div>
        <div class="att-ctrl-group att-topic-group">
          <label>Topic taught today (optional)</label>
          <input type="text" value="${escHtml(maAttTopic)}" placeholder="e.g. Arrays, cash flow, lab demo" oninput="maAttTopic=this.value">
        </div>
      </div>

      ${
        maAttType === "Practical"
          ? `
      <!-- Practical/Lab roll-number batching: only shown when Type = Practical.
           Lets the HOD mark attendance for just one roll-number batch (e.g.
           1-21) so multiple lab batches of the same class can be marked
           separately without clashing — mirrors the Teacher portal exactly. -->
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
        <label class="proxy-toggle">
          <input type="checkbox" ${maAttAllStudents ? "checked" : ""} onchange="toggleMaAllStudents(this.checked)">
          <span>All Students (whole class)</span>
        </label>
        ${
          !maAttAllStudents
            ? `
        <div class="att-controls" style="margin-top:10px;margin-bottom:0">
          <div class="att-ctrl-group">
            <label>Start Roll No.</label>
            <select onchange="onMaRollStartChange(this.value)">
              ${maRollOptionsHtml(maAttRollStart)}
            </select>
          </div>
          <div class="att-ctrl-group">
            <label>End Roll No.</label>
            <select onchange="onMaRollEndChange(this.value)">
              ${maRollOptionsHtml(maAttRollEnd)}
            </select>
          </div>
        </div>`
            : ""
        }
        <div style="font-size:11px;color:var(--text3,#888);font-weight:600;margin-top:8px">
          Only students within this roll range will appear below and get marked. Leave "All Students" checked to mark the whole class. Other teachers/HODs can mark a different roll range for a different lab at the same time.
        </div>
      </div>`
          : ""
      }
    </div>`;

  if (!maAttCourse || !maAttSem) {
    html += `<div class="empty-state" style="padding:32px 20px">
      <div class="e-icon">👉</div>
      <p>${!maAttCourse ? "Select a course above to begin" : "Now select a semester"}</p>
    </div>`;
    document.getElementById("markAttContent").innerHTML = html;
    updateMaStepper();
    return;
  }

  // ── Step 2: Select Subject (chip picker) ──
  const subjNames = getSubjNames(maAttCourse, parseInt(maAttSem));
  html += `<div class="card" style="margin-bottom:16px">
    <div class="card-title"><span class="ct-icon">📄</span> Step 2 — Select Subject</div>
    <label class="proxy-toggle">
      <input type="checkbox" ${maAttProxy ? "checked" : ""} onchange="maAttProxy=this.checked;maAttSubject='';maAttRecords={};renderMarkAttPage()">
      <span>Proxy lecture</span>
    </label>
    <div class="ma-subj-chip-wrap">`;
  if (!subjNames.length) {
    html += `<p style="color:var(--danger);font-size:13px;font-weight:600;margin-top:6px">
      No subject is assigned to ${escHtml(maAttCourse)} Sem ${maAttSem} yet. Add it from the Subjects section first.
    </p>`;
  } else {
    subjNames.forEach((sub) => {
      html += `<div class="ma-s-chip${maAttSubject === sub ? " sel" : ""}" onclick="selectMaSubject(decodeURIComponent('${encodeURIComponent(sub)}'))">${escHtml(sub)}</div>`;
    });
  }
  html += `</div></div>`;

  if (!maAttSubject) {
    html += `<div class="empty-state" style="padding:32px 20px">
      <div class="e-icon">👉</div><p>Now select a subject to load students.</p>
    </div>`;
    document.getElementById("markAttContent").innerHTML = html;
    updateMaStepper();
    return;
  }

  // ── Step 3: Mark Students (card grid) ──
  let saved = (((savedAttendance[maAttCourse] || {})[maAttSem] || {})[
    maAttSubject
  ] || {})[maAttDate];
  if (!Object.keys(maAttRecords).length && saved)
    maAttRecords = Object.assign({}, saved);

  if (maRollRangeIncomplete()) {
    html += `<div class="empty-state" style="padding:32px 20px">
      <div class="e-icon">🔢</div>
      <p>Select both a Start and End roll number above, or check "All Students".</p>
    </div>`;
    document.getElementById("markAttContent").innerHTML = html;
    updateMaStepper();
    return;
  }

  let students = getMaClassStudents();
  if (!students.length) {
    html += `<div class="empty-state" style="padding:32px 20px">
      <div class="e-icon">📄</div><p>${
        maAttType === "Practical" && !maAttAllStudents
          ? `No students found with roll number between ${escHtml(maAttRollStart)} and ${escHtml(maAttRollEnd)}.`
          : "No students found for this selection."
      }</p>
    </div>`;
    document.getElementById("markAttContent").innerHTML = html;
    updateMaStepper();
    return;
  }

  students.forEach((s) => {
    if (!maAttRecords[s.id]) maAttRecords[s.id] = "P";
  });
  let pC = students.filter((s) => maAttRecords[s.id] === "P").length;
  let aC = students.filter((s) => maAttRecords[s.id] === "A").length;
  let pct = students.length ? Math.round((pC / students.length) * 100) : 0;

  html += `<div class="card">
    <div class="card-title"><span class="ct-icon">👨‍🏫</span> Step 3 — Mark Attendance <span class="card-hd-sub" style="font-size:12px;color:var(--text2);font-weight:500;margin-left:8px">Tap a card to toggle Present ↔ Absent</span></div>
    <div class="att-stats-row" id="maAttSummaryBar">
      <div class="att-stat-chip total"><div class="asv">${students.length}</div><div class="asl">Total</div></div>
      <div class="att-stat-chip present"><div class="asv">${pC}</div><div class="asl">Present</div></div>
      <div class="att-stat-chip absent"><div class="asv">${aC}</div><div class="asl">Absent</div></div>
      <div class="att-stat-chip pct"><div class="asv">${pct}%</div><div class="asl">% Present</div></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
      <span style="font-size:12px;color:var(--text2);font-weight:600">Mark All:</span>
      <button class="btn btn-success btn-sm" onclick="maMarkAll('P')">✅ All Present</button>
      <button class="btn btn-danger btn-sm" onclick="maMarkAll('A')">✕ All Absent</button>
    </div>
    <div class="att-card-grid" id="maAttCardGrid">`;

  students.forEach((s) => {
    let isPresent = maAttRecords[s.id] !== "A";
    html += `<div class="att-card ${isPresent ? "present" : "absent"}" id="macard_${s.id}"
      onclick="toggleMaCard('${s.id}')" title="${escHtml(s.name)} — Click to toggle">
      <img src="${s.avatar || "https://ui-avatars.com/api/?name=" + encodeURIComponent(s.name) + "&size=80&background=random"}" alt="">
      <div class="att-card-name">${escHtml(givenNameOf(s.name))}</div>
      <div class="att-card-roll">${escHtml(lastThreeOfRoll(s.roll))}</div>
      <div class="att-card-status">${isPresent ? "Present" : "Absent"}</div>
    </div>`;
  });

  html += `</div>
    <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="prepareMaConfirm()">📚 Review &amp; Submit</button>
      <button class="btn btn-ghost" onclick="loadMarkAttendance()">🔄 Reset</button>
      <button class="btn btn-teal btn-sm" onclick="exportMarkAttExcel()">📤 Export Excel</button>
    </div>

    <!-- ── Step 4: Confirm ── -->
    <div class="ma-conf-panel" id="maConfPanel">
      <div class="ma-conf-title">✅ Confirm Attendance</div>
      <div class="att-stats-row" id="maConfNums"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-success" onclick="saveMarkAttendance()">✅ Confirm &amp; Save</button>
        <button class="btn btn-ghost" onclick="document.getElementById('maConfPanel').classList.remove('open')">Cancel</button>
      </div>
    </div>
  </div>`; // close att-mark-section

  document.getElementById("markAttContent").innerHTML = html;
  updateMaStepper();
}

/** Subject chip clicked — locks in the subject and reveals the grid (Step 3) */
function selectMaSubject(sub) {
  maAttSubject = sub;
  maAttRecords = {};
  renderMarkAttPage();
  setTimeout(() => {
    document
      .getElementById("maAttCardGrid")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 150);
}

/**
 * Toggle a single student card between Present and Absent.
 * Updates only the clicked card + stats row — no full re-render.
 */
function toggleMaCard(stuId) {
  maAttRecords[stuId] = maAttRecords[stuId] === "A" ? "P" : "A";
  let card = document.getElementById("macard_" + stuId);
  if (card) {
    let isPresent = maAttRecords[stuId] === "P";
    card.className = "att-card " + (isPresent ? "present" : "absent");
    card.querySelector(".att-card-status").textContent = isPresent
      ? "Present"
      : "Absent";
  }
  _refreshMaStats();
}

function _refreshMaStats() {
  let students = getMaClassStudents();
  let pC = students.filter((s) => maAttRecords[s.id] === "P").length;
  let aC = students.filter((s) => maAttRecords[s.id] === "A").length;
  let pct = students.length ? Math.round((pC / students.length) * 100) : 0;
  let row = document.getElementById("maAttSummaryBar");
  if (row)
    row.innerHTML = `
    <div class="att-stat-chip total"><div class="asv">${students.length}</div><div class="asl">Total</div></div>
    <div class="att-stat-chip present"><div class="asv">${pC}</div><div class="asl">Present</div></div>
    <div class="att-stat-chip absent"><div class="asv">${aC}</div><div class="asl">Absent</div></div>
    <div class="att-stat-chip pct"><div class="asv">${pct}%</div><div class="asl">% Present</div></div>`;
}

/** Mark all students Present or Absent and re-render (full grid refresh) */
function maMarkAll(status) {
  let students = getMaClassStudents();
  students.forEach((s) => {
    maAttRecords[s.id] = status;
  });
  renderMarkAttPage();
}

/** Step 4 — validate + show the confirm panel with a final numbers summary */
function prepareMaConfirm() {
  if (!maAttCourse || !maAttSem || !maAttSubject || !maAttDate) {
    showToast("Please select all fields.", true);
    return;
  }
  if (maAttDate > _todayIsoDateString()) {
    showToast("Attendance cannot be marked for a future date.", true);
    return;
  }
  const timingCheck1 = _validateMaTiming();
  if (!timingCheck1.ok) {
    showToast(timingCheck1.message, true);
    return;
  }
  if (maRollRangeIncomplete()) {
    showToast(
      'Select both a Start and End roll number, or check "All Students".',
      true,
    );
    return;
  }
  let students = getMaClassStudents();
  if (!students.length) {
    showToast("No students to mark for this roll range.", true);
    return;
  }
  let pC = students.filter((s) => maAttRecords[s.id] === "P").length;
  let aC = students.filter((s) => maAttRecords[s.id] === "A").length;
  let pct = students.length ? Math.round((pC / students.length) * 100) : 0;
  const panel = document.getElementById("maConfPanel");
  const nums = document.getElementById("maConfNums");
  if (nums)
    nums.innerHTML = `
    <div class="att-stat-chip total"><div class="asv">${students.length}</div><div class="asl">Total</div></div>
    <div class="att-stat-chip present"><div class="asv">${pC}</div><div class="asl">Present</div></div>
    <div class="att-stat-chip absent"><div class="asv">${aC}</div><div class="asl">Absent</div></div>
    <div class="att-stat-chip pct"><div class="asv">${pct}%</div><div class="asl">% Present</div></div>`;
  if (panel) {
    panel.classList.add("open");
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  maStep = 4;
  updateMaStepper();
}

/**
 * Save attendance:
 * 1. POSTs to /api/hod/attendance (production backend — source of truth)
 * 2. On success, mirrors into local savedAttendance (for reports/student modals)
 * 3. Refreshes student attendance percentages in the reports module
 */
async function saveMarkAttendance() {
  if (!maAttCourse || !maAttSem || !maAttSubject || !maAttDate) {
    showToast("Please select all fields.", true);
    return;
  }

  // Catch the two new time rules on the client first, so the HOD gets
  // instant feedback instead of waiting for a round trip to the server
  // just to find out the date or duration was invalid.
  if (maAttDate > _todayIsoDateString()) {
    showToast("Attendance cannot be marked for a future date.", true);
    return;
  }
  const timingCheck2 = _validateMaTiming();
  if (!timingCheck2.ok) {
    showToast(timingCheck2.message, true);
    return;
  }
  if (maRollRangeIncomplete()) {
    showToast(
      'Select both a Start and End roll number, or check "All Students".',
      true,
    );
    return;
  }

  // Only the students currently in scope (whole class, or the chosen roll
  // range for a Practical batch) get submitted — mirrors the Teacher
  // portal, and stops a stale maAttRecords entry from a wider selection
  // leaking into a narrower batch's submission.
  const scopedStudents = getMaClassStudents();
  if (!scopedStudents.length) {
    showToast("No students to mark for this roll range.", true);
    return;
  }
  const scopedRecords = {};
  scopedStudents.forEach((s) => {
    scopedRecords[s.id] = maAttRecords[s.id] || "P";
  });

  let pC = scopedStudents.filter((s) => scopedRecords[s.id] === "P").length;
  let aC = scopedStudents.filter((s) => scopedRecords[s.id] === "A").length;

  // 2. POST to production backend — this is the source of truth. If it
  // fails (validation error, duplicate lecture, time conflict, etc.) we
  // stop here and surface the real error instead of pretending it saved.
  try {
    await apiJson("/api/hod/attendance", {
      method: "POST",
      body: JSON.stringify({
        course: maAttCourse,
        semester: maAttSem,
        subject: maAttSubject,
        date: maAttDate,
        records: scopedRecords,
        time: maAttStart && maAttEnd ? `${maAttStart} - ${maAttEnd}` : "",
        division: maAttDivision || "",
        type: maAttType,
        topic: maAttTopic,
        isProxy: maAttProxy,
        allStudents: maAttType === "Practical" ? maAttAllStudents : true,
        rollRangeStart:
          maAttType === "Practical" && !maAttAllStudents ? maAttRollStart : "",
        rollRangeEnd:
          maAttType === "Practical" && !maAttAllStudents ? maAttRollEnd : "",
      }),
    });
  } catch (e) {
    showToast(
      e.message || "Failed to save attendance. Please try again.",
      true,
    );
    return;
  }

  // 1. Cache locally too (keeps report %s in sync without a re-fetch)
  if (!savedAttendance[maAttCourse]) savedAttendance[maAttCourse] = {};
  if (!savedAttendance[maAttCourse][maAttSem])
    savedAttendance[maAttCourse][maAttSem] = {};
  if (!savedAttendance[maAttCourse][maAttSem][maAttSubject])
    savedAttendance[maAttCourse][maAttSem][maAttSubject] = {};
  savedAttendance[maAttCourse][maAttSem][maAttSubject][maAttDate] =
    Object.assign(
      {},
      (savedAttendance[maAttCourse][maAttSem][maAttSubject] || {})[maAttDate],
      scopedRecords,
    );

  // 3. Refresh percentage calculations in reports
  invalidateAttReportCache();
  try {
    await buildStuReports(maAttCourse, maAttSem, true);
  } catch (e) {
    console.warn("[HOD] Attendance report refresh failed:", e.message);
  }
  refreshStuReportsFromAtt();
  showToast(`Attendance saved! ${pC} Present, ${aC} Absent.`);
  loadMarkAttendance(); // reset the wizard back to Step 1, ready for the next lecture
}

/**
 * Export the current Mark Attendance view to Excel.
 * Columns: Name | Roll | Course | Sem | Subject | Date | Status
 */
function exportMarkAttExcel() {
  if (!maAttCourse || !maAttSem || !maAttSubject) {
    showToast("Select course, semester and subject first.", true);
    return;
  }
  let students = getMaClassStudents();
  if (!students.length) {
    showToast("No students found.", true);
    return;
  }
  try {
    let data = [
      ["Name", "Roll No", "Course", "Sem", "Subject", "Date", "Status"],
    ];
    students.forEach((s) => {
      let st = maAttRecords[s.id] || "P";
      let label = st === "P" ? "Present" : st === "A" ? "Absent" : "Late";
      data.push([
        s.name,
        s.roll,
        s.course,
        `Sem ${s.sem}`,
        maAttSubject,
        maAttDate,
        label,
      ]);
    });
    let wb = XLSX.utils.book_new();
    let ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [
      { wch: 24 },
      { wch: 14 },
      { wch: 10 },
      { wch: 8 },
      { wch: 28 },
      { wch: 14 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    let fn = `Attendance_${maAttCourse}_Sem${maAttSem}_${maAttSubject.replace(/\s/g, "_")}_${maAttDate}`;
    XLSX.writeFile(wb, fn + ".xlsx");
    showToast("Attendance Excel downloaded!");
  } catch (e) {
    showToast("Export failed: " + e.message, true);
  }
}

// ═══════════════════════════════════════════════════════════
// HOD Attendance History (spec item 4 & 5) — unlike a Teacher (who only ever
// sees lectures THEY took), HOD sees every teacher's lecture in the
// department and can edit any of them.
// ═══════════════════════════════════════════════════════════
const HodAttHistory = {
  _sessionKey: null,
  _records: null,

  async open() {
    this._ensureModals();
    document.getElementById("hodAttHistoryOverlay").classList.add("open");
    const body = document.getElementById("hodAttHistoryBody");
    body.innerHTML = "Loading…";
    try {
      const d = await apiJson("/api/hod/attendance/history");
      this._renderList(d.sessions || []);
    } catch (e) {
      body.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`;
    }
  },

  close() {
    document.getElementById("hodAttHistoryOverlay")?.classList.remove("open");
  },
  closeSession() {
    document.getElementById("hodAttSessionOverlay")?.classList.remove("open");
  },

  _ensureModals() {
    if (document.getElementById("hodAttHistoryOverlay")) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <div class="modal-overlay" id="hodAttHistoryOverlay" onclick="if(event.target===this)HodAttHistory.close()">
        <div class="modal-card" style="max-width:680px;max-height:82vh;display:flex;flex-direction:column">
          <div class="modal-header"><span>🕘 Attendance History — All Teachers</span><button onclick="HodAttHistory.close()">✕</button></div>
          <div class="modal-body" id="hodAttHistoryBody" style="overflow-y:auto;padding:16px"></div>
        </div>
      </div>
      <div class="modal-overlay" id="hodAttSessionOverlay" onclick="if(event.target===this)HodAttHistory.closeSession()">
        <div class="modal-card" style="max-width:560px;max-height:82vh;display:flex;flex-direction:column">
          <div class="modal-header"><span id="hodAttSessionTitle">Lecture Details</span><button onclick="HodAttHistory.closeSession()">✕</button></div>
          <div class="modal-body" id="hodAttSessionBody" style="overflow-y:auto;padding:16px"></div>
        </div>
      </div>`,
    );
  },

  _renderList(sessions) {
    const body = document.getElementById("hodAttHistoryBody");
    if (!sessions.length) {
      body.innerHTML = `<p style="text-align:center;color:var(--muted,#888);padding:24px">No attendance submitted by any teacher yet.</p>`;
      return;
    }
    body.innerHTML = sessions
      .map(
        (s) => `
      <div class="sched-slot-card" style="cursor:pointer" onclick="HodAttHistory.openSession('${s.sessionKey}')">
        <div class="ssc-time"><b>${fmtDate(s.date)}</b>${s.time ? "<br>" + s.time : ""}</div>
        <div class="ssc-info">
          <span><b>${escHtml(s.subjectName || "")}</b> — ${escHtml(s.teacherName)}</span>
          <span>${escHtml(s.course || "")} Sem ${s.semester || ""}${s.division ? " · " + escHtml(s.division) : ""}${s.allStudents === false && s.rollRangeStart && s.rollRangeEnd ? " · Roll " + escHtml(s.rollRangeStart) + "-" + escHtml(s.rollRangeEnd) : ""}</span>
          <span>✅ ${s.present} &nbsp; ❌ ${s.absent}</span>
        </div>
      </div>`,
      )
      .join("");
  },

  async openSession(sessionKey) {
    document.getElementById("hodAttSessionOverlay").classList.add("open");
    const body = document.getElementById("hodAttSessionBody");
    body.innerHTML = "Loading…";
    try {
      const d = await apiJson(
        "/api/hod/attendance/session/" + encodeURIComponent(sessionKey),
      );
      this._sessionKey = sessionKey;
      this._records = d.records;
      document.getElementById("hodAttSessionTitle").textContent =
        `${d.meta.subjectName} — ${d.meta.teacherName}`;
      const uploadedAt = d.meta.uploadedAt
        ? fmtDateTime(d.meta.uploadedAt)
        : null;
      body.innerHTML = `
        <p style="color:var(--muted,#888);font-size:13px;margin-bottom:10px">
          ${d.meta.course} Sem ${d.meta.semester}${d.meta.division ? " · " + escHtml(d.meta.division) : ""}${d.meta.allStudents === false && d.meta.rollRangeStart && d.meta.rollRangeEnd ? " · Roll " + escHtml(d.meta.rollRangeStart) + "-" + escHtml(d.meta.rollRangeEnd) : ""} ·
          Taken by <b>${escHtml(d.meta.teacherName)}</b> — editing here updates this lecture only.
        </p>
        <div id="hodAttSessionSeats" style="display:flex;flex-direction:column;gap:6px">
          ${d.records
            .map(
              (r, i) => `
            <div class="seat${r.status === "absent" ? " absent" : ""}" data-idx="${i}"
                 style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 12px;cursor:pointer"
                 onclick="HodAttHistory.toggleStatus(${i})">
              <span>${escHtml(r.student?.name || "Unknown")} <span style="opacity:.7;font-size:12px">${escHtml(r.student?.roll || r.student?.rollNo || "")}</span></span>
              <b>${r.status === "absent" ? "Absent" : "Present"}</b>
            </div>`,
            )
            .join("")}
        </div>
        <button class="btn btn-primary" style="margin-top:14px;width:100%" onclick="HodAttHistory.save()">Save Changes</button>
        ${uploadedAt ? `<div style="font-size:11px;color:var(--muted,#888);margin-top:10px">Lecture date: ${fmtDate(d.meta.date)} · Uploaded ${uploadedAt}</div>` : ""}
      `;
    } catch (e) {
      body.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`;
    }
  },

  toggleStatus(idx) {
    if (!this._records || !this._records[idx]) return;
    const r = this._records[idx];
    r.status = r.status === "present" ? "absent" : "present";
    const el = document.querySelector(
      `#hodAttSessionSeats .seat[data-idx="${idx}"]`,
    );
    if (el) {
      el.classList.toggle("absent", r.status === "absent");
      el.querySelector("b").textContent =
        r.status === "absent" ? "Absent" : "Present";
    }
  },

  async save() {
    if (!this._sessionKey || !this._records) return;
    try {
      const payload = this._records.map((r) => ({
        student: r.student?._id || r.student,
        status: r.status,
      }));
      const d = await apiJson(
        "/api/hod/attendance/session/" + encodeURIComponent(this._sessionKey),
        {
          method: "PUT",
          body: JSON.stringify({ records: payload }),
        },
      );
      showToast(d.message || "Attendance updated.");
      this.closeSession();
      this.open();
    } catch (e) {
      showToast(e.message || "Failed to save changes.", true);
    }
  },
};

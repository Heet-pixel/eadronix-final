// hod/js/schedule.js — Schedule management: renders, edits, and saves to DB
// HOD is the single source of truth for schedule. Changes propagate to teacher & student automatically.

const DAYS_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Must stay in sync with MINIMUM_LECTURE_DURATION_MINUTES in
// src/controllers/common.js — the backend enforces this rule no matter
// what, but checking it here too means the HOD sees the error instantly
// instead of waiting for a round trip to the server.
const MINIMUM_LECTURE_DURATION_MINUTES = 30;

/**
 * _isLectureDurationValid()
 * ---------------------------
 * Checks whether a proposed lecture's start/end time is at least
 * MINIMUM_LECTURE_DURATION_MINUTES apart.
 *
 * @param {string} startTime - "HH:MM" 24-hour start time.
 * @param {string} endTime - "HH:MM" 24-hour end time.
 * @returns {boolean} true if the duration is valid, false otherwise.
 */
function _isLectureDurationValid(startTime, endTime) {
  if (!startTime || !endTime) return false;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const durationInMinutes =
    endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return durationInMinutes >= MINIMUM_LECTURE_DURATION_MINUTES;
}

/**
 * calcEndTime()
 * ---------------------------
 * Auto-calculates a slot's end time from its start time + type:
 *   Lecture  -> start + 1 hour
 *   Lab      -> start + 2 hours (practical sessions run longer)
 *   Tutorial -> no auto value; HOD enters start & end manually
 * The result is only ever a *default* — whoever is editing the slot can
 * still type over it afterwards, this just saves them the arithmetic.
 *
 * @param {string} startTime - "HH:MM" 24-hour start time.
 * @param {string} type - "Lecture" | "Lab" | "Tutorial"
 * @returns {string} "HH:MM" end time, or '' if it can't be computed / type is Tutorial.
 */
function calcEndTime(startTime, type) {
  if (!startTime) return "";
  const addMinutes = type === "Lab" ? 120 : type === "Lecture" ? 60 : 0; // Tutorial -> manual, no default
  if (!addMinutes) return "";
  const [h, m] = startTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const total = h * 60 + m + addMinutes;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

// Local in-memory schedule: { course: { sem: { day: [{ subjectName, startTime, endTime, time, room, type, _id }] } } }
let scheduleData = {};

/* ─── Load schedule from backend ─────────────────────────────────────── */
async function loadSchedule() {
  const outer = document.getElementById("schedOuter");
  if (!outer) return;
  outer.innerHTML = `<div class="loading-msg" style="padding:40px;text-align:center;color:var(--text2);">⏳ Loading schedule...</div>`;
  try {
    await refreshSubjects();
    const data = await apiJson("/api/hod/schedule");
    scheduleData = data.schedule || {};
    // Merge any courses from students not yet in schedule
    HOD_COURSES.forEach((c) => {
      if (!scheduleData[c]) scheduleData[c] = {};
    });
    renderSchedule();
  } catch (e) {
    outer.innerHTML = `<div style="padding:40px;text-align:center;color:var(--danger);">⚠️ Failed to load schedule: ${e.message}</div>`;
  }
}

/* ─── Render the full schedule UI ────────────────────────────────────── */
function renderSchedule() {
  const outer = document.getElementById("schedOuter");
  if (!outer) return;
  const scheduleCourses = HOD_COURSES.filter(
    (course) => String(course).toLowerCase() !== "general",
  );
  if (!scheduleCourses.length) {
    outer.innerHTML = `<div class="empty-state"><div class="e-icon">📅</div><p>No courses found. Add students with course names first.</p></div>`;
    return;
  }
  let html = "";
  scheduleCourses.forEach((course) => {
    html += `<div class="schedule-col">
      <div class="schedule-col-title">${escHtml(course)} Schedule</div>
      <div class="sched-sem-list">`;
    for (let sem = 1; sem <= SEM_COUNT; sem++) {
      const isOpen = openSchedSem[course] === sem;
      const dayData =
        scheduleData[course] && scheduleData[course][sem]
          ? scheduleData[course][sem]
          : {};
      const subjCount =
        SUBJECTS[course] && SUBJECTS[course][sem]
          ? SUBJECTS[course][sem].length
          : 0;
      html += `
        <div class="sched-sem-wrap">
          <div class="sched-sem-btn ${isOpen ? "active" : ""}" onclick="toggleSchedSem('${course}',${sem})">
            Semester ${sem} <span class="sched-slot-count">${subjCount} subject${subjCount !== 1 ? "s" : ""}</span>
            <span class="sched-arrow">${isOpen ? "▲" : "▼"}</span>
          </div>
          <div class="sched-body ${isOpen ? "open" : ""}" id="sb_${course}_${sem}">
            ${isOpen ? renderSchedBody(course, sem, dayData) : ""}
          </div>
        </div>`;
    }
    html += `</div></div>`;
  });
  outer.innerHTML = html;
}

function renderSchedBody(course, sem, dayData) {
  let html = `${renderSemesterSubjectStrip(course, sem, dayData)}
  <div class="sched-day-tabs">
    ${DAYS_ORDER.map((d) => {
      const cnt = (dayData[d] || []).length;
      return `<div class="sday-tab" onclick="renderDayView('${course}',${sem},'${d}')" id="sdt_${course}_${sem}_${d}">${d} ${cnt > 0 ? `<span class="sday-cnt">${cnt}</span>` : ""}</div>`;
    }).join("")}
  </div>
  <div id="sdv_${course}_${sem}"></div>
  <div class="sched-actions">
    <button class="btn btn-primary btn-sm" onclick="openAddSlotModal('${course}',${sem})">＋ Add Slot</button>
    <button class="btn btn-success btn-sm" onclick="saveFullSchedule('${course}',${sem})">💾 Save All Changes</button>
  </div>`;
  return html;
}

function renderSemesterSubjectStrip(course, sem, dayData) {
  const subjectRows =
    SUBJECTS[course] && SUBJECTS[course][sem] ? SUBJECTS[course][sem] : [];
  const slots = [];
  Object.values(dayData || {}).forEach((daySlots) =>
    (daySlots || []).forEach((slot) => slots.push(slot)),
  );
  // A subject can now have multiple lecture slots per week (same or
  // different teacher) — count them all instead of finding just one.
  const countByName = new Map();
  slots.forEach((slot) => {
    const key = String(slot.subjectName || "").toLowerCase();
    countByName.set(key, (countByName.get(key) || 0) + 1);
  });
  const rows = subjectRows.map((subject, idx) => {
    const name = typeof subject === "object" ? subject.name : subject;
    const code =
      typeof subject === "object"
        ? subject.code || `SUB${idx + 1}`
        : `SUB${idx + 1}`;
    const count = countByName.get(String(name || "").toLowerCase()) || 0;
    return { name, code, count };
  });

  if (!rows.length) {
    return `<div class="semester-subject-panel">
      <div class="semester-subject-title">Semester ${sem}</div>
      <div class="sched-empty-day">No subjects added for this semester yet.</div>
    </div>`;
  }

  return `<div class="semester-subject-panel">
    <div class="semester-subject-title">Semester ${sem}</div>
    <div class="semester-subject-list">
      ${rows
        .map(
          (row) => `
        <div class="semester-subject-row">
          <div class="semester-subject-main">
            <span class="semester-subject-code">${escHtml(row.code)}</span>
            <span class="semester-subject-name">${escHtml(row.name)}</span>
          </div>
          <span class="semester-subject-time ${row.count ? "" : "is-empty"}">${row.count ? `${row.count} lecture${row.count !== 1 ? "s" : ""}/week` : "Not scheduled yet"}</span>
        </div>`,
        )
        .join("")}
    </div>
    <div class="semester-subject-foot">${rows.length} subject${rows.length !== 1 ? "s" : ""}</div>
  </div>`;
}

let activeSchedDay = {}; // { "course_sem": "Mon" } — remembers which day tab is open so Add Slot doesn't need to ask again

function renderDayView(course, sem, day) {
  activeSchedDay[`${course}_${sem}`] = day;
  // Highlight active tab
  DAYS_ORDER.forEach((d) => {
    const t = document.getElementById(`sdt_${course}_${sem}_${d}`);
    if (t) t.classList.toggle("active", d === day);
  });
  const dayData =
    (scheduleData[course] &&
      scheduleData[course][sem] &&
      scheduleData[course][sem][day]) ||
    [];
  const cont = document.getElementById(`sdv_${course}_${sem}`);
  if (!cont) return;
  if (!dayData.length) {
    cont.innerHTML = `<div class="sched-empty-day">No slots for ${day}. Click "＋ Add Slot" to add one.</div>`;
    return;
  }
  // Subject choices always come from the Admin-created master list for this course+sem —
  // HOD selects, never types, per spec item 5.
  const subjectChoices = getSubjObjects(course, sem);
  const teacherChoices = typeof allTeachers !== "undefined" ? allTeachers : [];
  cont.innerHTML = `<div class="sched-slot-list">
    ${dayData
      .map(
        (slot, idx) => `
      <div class="sched-slot-card" id="ssc_${course}_${sem}_${day}_${idx}">
        <div class="ssc-time">
          <input type="time" value="${slot.startTime || ""}" onchange="updateSlot('${course}',${sem},'${day}',${idx},'startTime',this.value); autoCalcExistingSlotEnd('${course}',${sem},'${day}',${idx})" title="Start time">
          <span>–</span>
          <input type="time" id="sscEnd_${course}_${sem}_${day}_${idx}" value="${slot.endTime || ""}" onchange="updateSlot('${course}',${sem},'${day}',${idx},'endTime',this.value)" title="End time (auto-suggested from start + type, editable)">
        </div>
        <div class="ssc-info">
          <select class="ssc-subj" ${isGeneralSlotType(slot.type) ? "disabled" : ""} onchange="updateSlotSubject('${course}',${sem},'${day}',${idx},this.value)">
            <option value="">${isGeneralSlotType(slot.type) ? slot.type : "-- Select subject (Admin list) --"}</option>
            ${subjectChoices.map((s) => `<option value="${s.id}" ${String(slot.subject || "") === String(s.id) || slot.subjectName === s.name ? "selected" : ""}>${escHtml(s.name)}</option>`).join("")}
          </select>
          <select class="ssc-teacher" ${isGeneralSlotType(slot.type) ? "disabled" : ""} onchange="updateSlotTeacher('${course}',${sem},'${day}',${idx},this.value)">
            <option value="">${isGeneralSlotType(slot.type) ? "No teacher needed" : "-- Select teacher --"}</option>
            ${teacherChoices.map((t) => `<option value="${t.id || t._id}" ${String(slot.teacherId || "") === String(t.id || t._id) ? "selected" : ""}>${escHtml(t.name)}</option>`).join("")}
          </select>
          <input class="ssc-room" type="text" value="${escHtml(slot.room || "")}" placeholder="Room (optional)" onchange="updateSlot('${course}',${sem},'${day}',${idx},'room',this.value)">
          <select class="ssc-type" onchange="updateSlot('${course}',${sem},'${day}',${idx},'type',this.value); autoCalcExistingSlotEnd('${course}',${sem},'${day}',${idx}); renderDayView('${course}',${sem},'${day}')">
            ${["Lecture", "Lab", "Tutorial", "Break", "Library"].map((t) => `<option ${(slot.type || "Lecture") === t ? "selected" : ""}>${t}</option>`).join("")}
          </select>
          <div class="ssc-lab-range ${(slot.type || "Lecture") === "Lab" ? "show" : ""}">
            <select onchange="updateSlot('${course}',${sem},'${day}',${idx},'labRollStart',this.value)">
              ${renderRollOptions(course, sem, slot.labRollStart, "Start roll no.")}
            </select>
            <select onchange="updateSlot('${course}',${sem},'${day}',${idx},'labRollEnd',this.value)">
              ${renderRollOptions(course, sem, slot.labRollEnd, "End roll no.")}
            </select>
          </div>
        </div>
        <button class="ssc-del" onclick="removeSlot('${course}',${sem},'${day}',${idx})" title="Remove slot">✕</button>
      </div>
    `,
      )
      .join("")}
  </div>`;
}

// Subject is chosen from the Admin master list only — store both id (sent to
// backend for server-side validation) and name (for immediate UI display).
function updateSlotSubject(course, sem, day, idx, subjectId) {
  const slot = scheduleData[course]?.[sem]?.[day]?.[idx];
  if (!slot) return;
  const choice = getSubjObjects(course, sem).find(
    (s) => String(s.id) === String(subjectId),
  );
  slot.subject = subjectId || "";
  slot.subjectName = choice ? choice.name : "";
}

function updateSlotTeacher(course, sem, day, idx, teacherId) {
  const slot = scheduleData[course]?.[sem]?.[day]?.[idx];
  if (!slot) return;
  const choice = (typeof allTeachers !== "undefined" ? allTeachers : []).find(
    (t) => String(t.id || t._id) === String(teacherId),
  );
  slot.teacherId = teacherId || "";
  slot.teacher = choice ? choice.name : ""; // display name, matches server's groupSchedule() convention
  slot.teacherName = choice ? choice.name : "";
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isGeneralSlotType(type) {
  return ["Break", "Library"].includes(type);
}

function getRollChoices(course, sem) {
  return (typeof allStudents !== "undefined" ? allStudents : [])
    .filter(
      (s) =>
        s.course === course &&
        String(s.sem || s.semester || 1) === String(sem) &&
        (s.roll || s.rollNo || s.rollNumber),
    )
    .map((s) => String(s.roll || s.rollNo || s.rollNumber).trim())
    .filter(Boolean)
    .filter((roll, idx, arr) => arr.indexOf(roll) === idx)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function renderRollOptions(course, sem, selected, placeholder) {
  const rolls = getRollChoices(course, sem);
  if (!rolls.length) return `<option value="">No student rolls found</option>`;
  return (
    `<option value="">-- ${placeholder} --</option>` +
    rolls
      .map(
        (r) =>
          `<option value="${escHtml(r)}" ${String(selected || "") === r ? "selected" : ""}>${escHtml(r)}</option>`,
      )
      .join("")
  );
}

/* ─── Slot CRUD (local, then save to DB) ───────────────────────────── */
function updateSlot(course, sem, day, idx, field, value) {
  if (!scheduleData[course]) scheduleData[course] = {};
  if (!scheduleData[course][sem]) scheduleData[course][sem] = {};
  if (!scheduleData[course][sem][day]) scheduleData[course][sem][day] = [];
  const slot = scheduleData[course][sem][day][idx];
  if (slot) {
    slot[field] = value;
    if (field === "type" && isGeneralSlotType(value)) {
      slot.subject = "";
      slot.subjectName = value;
      slot.teacherId = "";
      slot.teacher = "";
      slot.teacherName = "";
      slot.labRollStart = "";
      slot.labRollEnd = "";
    }
    if (field === "type" && value !== "Lab") {
      slot.labRollStart = "";
      slot.labRollEnd = "";
    }
    if (field === "startTime" || field === "endTime") {
      slot.time = `${to12h(slot.startTime || "")}${slot.endTime ? " – " + to12h(slot.endTime) : ""}`;
    }
  }
}

// After the start time or type changes on an already-added slot card, refresh
// its end time from the same Lecture(+1h) / Lab(+2h) / Tutorial(manual) rule
// used when adding a new slot — still fully editable afterwards.
function autoCalcExistingSlotEnd(course, sem, day, idx) {
  const slot = scheduleData[course]?.[sem]?.[day]?.[idx];
  if (!slot) return;
  const computed = calcEndTime(slot.startTime, slot.type || "Lecture");
  if (!computed) return; // Tutorial — leave whatever end time is already set
  slot.endTime = computed;
  slot.time = `${to12h(slot.startTime || "")}${slot.endTime ? " – " + to12h(slot.endTime) : ""}`;
  const endInput = document.getElementById(
    `sscEnd_${course}_${sem}_${day}_${idx}`,
  );
  if (endInput) endInput.value = computed;
}

function removeSlot(course, sem, day, idx) {
  if (
    !scheduleData[course] ||
    !scheduleData[course][sem] ||
    !scheduleData[course][sem][day]
  )
    return;
  scheduleData[course][sem][day].splice(idx, 1);
  openSchedSem[course] = sem;
  renderSchedule();
  // Reopen day view
  setTimeout(() => {
    const body = document.getElementById(`sb_${course}_${sem}`);
    if (body) body.classList.add("open");
    renderDayView(course, sem, day);
  }, 50);
  showToast('Slot removed. Click "Save All Changes" to persist.', "warn");
}

function toggleSchedSem(course, sem) {
  openSchedSem[course] = openSchedSem[course] === sem ? null : sem;
  renderSchedule();
  if (openSchedSem[course] === sem) {
    // Auto-open first day with slots, or Monday
    const dayData =
      scheduleData[course] && scheduleData[course][sem]
        ? scheduleData[course][sem]
        : {};
    const firstDay =
      DAYS_ORDER.find((d) => dayData[d] && dayData[d].length > 0) || "Mon";
    setTimeout(() => renderDayView(course, sem, firstDay), 50);
  }
}

/* ─── Add Slot Modal ─────────────────────────────────────────────────── */
let _addSlotCtx = null;
function openAddSlotModal(course, sem) {
  // The HOD already clicked a specific day tab before clicking "Add Slot" —
  // use that day directly instead of asking again.
  const day = activeSchedDay[`${course}_${sem}`] || "Mon";
  _addSlotCtx = { course, sem, day };
  // Subject choices come ONLY from the Admin-created master list for this
  // course+sem — HOD picks, never types (spec item 5).
  const subjs = getSubjObjects(course, sem);
  const teachers = typeof allTeachers !== "undefined" ? allTeachers : [];
  const subjOptions = subjs.length
    ? subjs
        .map((s) => `<option value="${s.id}">${escHtml(s.name)}</option>`)
        .join("")
    : `<option value="">No subjects yet — ask Admin to add subjects for this course/semester</option>`;
  const teacherOptions = teachers.length
    ? teachers
        .map(
          (t) => `<option value="${t.id || t._id}">${escHtml(t.name)}</option>`,
        )
        .join("")
    : `<option value="">No teachers in this department yet</option>`;
  const defaultStart = "09:00";
  const defaultType = "Lecture";
  const html = `
    <div class="modal-overlay open" id="addSlotOverlay" onclick="if(event.target===this)closeAddSlotModal()">
      <div class="modal-card" style="max-width:420px">
        <div class="modal-header"><span>＋ Add Schedule Slot — ${course} Sem ${sem} · ${day}</span><button onclick="closeAddSlotModal()">✕</button></div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;padding:20px">
          <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>Start Time</label><input type="time" id="slotStart" value="${defaultStart}" onchange="autoCalcSlotEnd()"></div>
            <div><label>End Time <span style="font-weight:400;color:var(--muted)">(auto — editable)</span></label><input type="time" id="slotEnd" value="${calcEndTime(defaultStart, defaultType) || "10:00"}"></div>
          </div>
          <div class="form-group">
            <label>Subject (from Admin subject list)</label>
            <select id="slotSubj"><option value="">-- Select subject --</option>${subjOptions}</select>
          </div>
          <div class="form-group">
            <label>Teacher</label>
            <select id="slotTeacher"><option value="">-- Select teacher --</option>${teacherOptions}</select>
          </div>
          <div class="form-group">
            <label>Room (optional)</label>
            <input type="text" id="slotRoom" placeholder="e.g. A-101">
          </div>
          <div class="form-group">
            <label>Type</label>
            <select id="slotType" onchange="autoCalcSlotEnd()">
              <option ${defaultType === "Lecture" ? "selected" : ""}>Lecture</option>
              <option>Lab</option>
              <option>Tutorial</option>
              <option>Break</option>
              <option>Library</option>
            </select>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">Lecture → end time auto-set 1 hr later · Lab → 2 hrs later · Tutorial → enter manually</div>
          </div>
          <div class="form-group slot-lab-range" id="slotLabRange" style="display:none">
            <label>Student Roll Number Range</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <select id="slotLabRollStart">${renderRollOptions(course, sem, "", "Starting roll number")}</select>
              <select id="slotLabRollEnd">${renderRollOptions(course, sem, "", "Ending roll number")}</select>
            </div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" onclick="closeAddSlotModal()">Cancel</button>
            <button class="btn btn-primary" onclick="confirmAddSlot()">Add Slot</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
}
// Recompute the End Time field whenever Start Time or Type changes in the
// Add Slot modal. Tutorial has no default — the HOD types both times in by hand.
function autoCalcSlotEnd() {
  const startEl = document.getElementById("slotStart");
  const typeEl = document.getElementById("slotType");
  const endEl = document.getElementById("slotEnd");
  if (!startEl || !typeEl || !endEl) return;
  const computed = calcEndTime(startEl.value, typeEl.value);
  if (computed) endEl.value = computed; // Tutorial: computed is '' → leave whatever the HOD already typed
  const rangeEl = document.getElementById("slotLabRange");
  if (rangeEl)
    rangeEl.style.display = typeEl.value === "Lab" ? "block" : "none";
  const isGeneral = isGeneralSlotType(typeEl.value);
  const subjEl = document.getElementById("slotSubj");
  const teacherEl = document.getElementById("slotTeacher");
  if (subjEl) {
    subjEl.disabled = isGeneral;
    if (isGeneral) subjEl.value = "";
  }
  if (teacherEl) {
    teacherEl.disabled = isGeneral;
    if (isGeneral) teacherEl.value = "";
  }
}
function closeAddSlotModal() {
  document.getElementById("addSlotOverlay")?.remove();
}
function confirmAddSlot() {
  if (!_addSlotCtx) return;
  const { course, sem, day } = _addSlotCtx;
  const startTime = document.getElementById("slotStart").value;
  const endTime = document.getElementById("slotEnd").value;
  const subjectId = document.getElementById("slotSubj").value;
  const teacherId = document.getElementById("slotTeacher").value;
  const room = document.getElementById("slotRoom").value.trim();
  const type = document.getElementById("slotType").value;
  const labRollStart =
    document.getElementById("slotLabRollStart")?.value.trim() || "";
  const labRollEnd =
    document.getElementById("slotLabRollEnd")?.value.trim() || "";
  const isGeneral = isGeneralSlotType(type);
  if (!isGeneral && !subjectId) {
    showToast("Please select a subject from the Admin subject list.", "error");
    return;
  }
  if (!isGeneral && !teacherId) {
    showToast("Please select a teacher.", "error");
    return;
  }
  if (type === "Lab" && (!labRollStart || !labRollEnd)) {
    showToast(
      "Please enter starting and ending roll numbers for this lab.",
      "error",
    );
    return;
  }
  if (!_isLectureDurationValid(startTime, endTime)) {
    showToast("A lecture must be at least 30 minutes long.", "error");
    return;
  }
  const subjChoice = getSubjObjects(course, sem).find(
    (s) => String(s.id) === String(subjectId),
  );
  const teacherChoice = (
    typeof allTeachers !== "undefined" ? allTeachers : []
  ).find((t) => String(t.id || t._id) === String(teacherId));
  if (!scheduleData[course]) scheduleData[course] = {};
  if (!scheduleData[course][sem]) scheduleData[course][sem] = {};
  if (!scheduleData[course][sem][day]) scheduleData[course][sem][day] = [];
  scheduleData[course][sem][day].push({
    subject: isGeneral ? "" : subjectId,
    subjectName: isGeneral ? type : subjChoice ? subjChoice.name : "",
    teacherId: isGeneral ? "" : teacherId,
    teacher: isGeneral ? "" : teacherChoice ? teacherChoice.name : "",
    teacherName: isGeneral ? "" : teacherChoice ? teacherChoice.name : "",
    startTime,
    endTime,
    room,
    type,
    labRollStart,
    labRollEnd,
    time: `${to12h(startTime)}${endTime ? " – " + to12h(endTime) : ""}`,
  });
  // Sort by startTime
  scheduleData[course][sem][day].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || ""),
  );
  closeAddSlotModal();
  openSchedSem[course] = sem;
  renderSchedule();
  setTimeout(() => {
    const body = document.getElementById(`sb_${course}_${sem}`);
    if (body) body.classList.add("open");
    renderDayView(course, sem, day);
  }, 50);
  showToast(
    `Slot added for ${day}. Click "Save All Changes" to persist.`,
    "info",
  );
}

/* ─── Save to backend ───────────────────────────────────────────────── */
async function saveFullSchedule(course, sem) {
  // Flatten scheduleData[course][sem] into slots array
  const dayMap =
    scheduleData[course] && scheduleData[course][sem]
      ? scheduleData[course][sem]
      : {};
  const slots = [];
  let validationError = "";
  for (const day of DAYS_ORDER) {
    const daySlots = dayMap[day] || [];
    daySlots.forEach((s) => {
      if (validationError) return;
      const isGeneral = isGeneralSlotType(s.type);
      if (!s.subject && !s.subjectName) return;
      if (
        (s.type || "Lecture") === "Lab" &&
        (!s.labRollStart || !s.labRollEnd)
      ) {
        validationError = `Please enter starting and ending roll numbers for the lab on ${day}.`;
        return;
      }
      slots.push({
        day,
        subjectId: isGeneral ? "" : s.subject || "",
        subjectName: s.subjectName || (isGeneral ? s.type : ""),
        teacher: isGeneral ? "" : s.teacherId || "",
        teacherName: isGeneral ? "" : s.teacherName || "",
        startTime: s.startTime || "",
        endTime: s.endTime || "",
        room: s.room || "",
        type: s.type || "Lecture",
        time: s.time || "",
        labRollStart: isGeneral ? "" : s.labRollStart || "",
        labRollEnd: isGeneral ? "" : s.labRollEnd || "",
      });
    });
  }
  if (validationError) {
    showToast(validationError, "error");
    return;
  }
  try {
    const res = await apiJson("/api/hod/schedule", {
      method: "POST",
      body: JSON.stringify({ course, semester: sem, slots }),
    });
    showToast(
      `✅ Schedule saved! ${res.saved} slots updated. Teachers & students will see changes immediately.`,
    );
    // Reload from DB to get _ids
    const fresh = await apiJson("/api/hod/schedule");
    scheduleData = fresh.schedule || {};
    HOD_COURSES.forEach((c) => {
      if (!scheduleData[c]) scheduleData[c] = {};
    });
    openSchedSem[course] = sem;
    renderSchedule();
    setTimeout(() => {
      const body = document.getElementById(`sb_${course}_${sem}`);
      if (body) body.classList.add("open");
    }, 50);
  } catch (e) {
    showToast(`❌ Save failed: ${e.message}`, "error");
  }
}

/* ─── Time helpers ───────────────────────────────────────────────────── */
function to12h(t24) {
  try {
    if (!t24 || !t24.includes(":")) return t24 || "";
    let [h, m] = t24.split(":").map(Number);
    const p = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${p}`;
  } catch {
    return t24 || "";
  }
}
function to24h(t12) {
  try {
    if (!t12) return "";
    if (/^\d{2}:\d{2}$/.test(t12)) return t12;
    const m = t12.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return "";
    let h = parseInt(m[1]),
      min = m[2],
      p = m[3].toUpperCase();
    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${min}`;
  } catch {
    return "";
  }
}

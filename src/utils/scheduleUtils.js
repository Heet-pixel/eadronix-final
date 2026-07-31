// Shared schedule utilities

export function to12h(t24) {
  try {
    if (!t24 || !t24.includes(":")) return t24 || "";
    let [h, m] = t24.split(":").map(Number);
    if (h >= 1 && h < 7) h += 12;
    const p = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${p}`;
  } catch {
    return t24 || "";
  }
}

export function to24h(t12) {
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

function sortMinutes(t24) {
  if (!t24 || !t24.includes(":")) return Number.MAX_SAFE_INTEGER;
  let [h, m] = t24.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return Number.MAX_SAFE_INTEGER;
  if (h >= 1 && h < 7) h += 12;
  return h * 60 + m;
}

function displayTime(startTime, endTime) {
  return startTime
    ? `${to12h(startTime)}${endTime ? " - " + to12h(endTime) : ""}`
    : "";
}

// Group schedule docs into { course: { sem: { day: [slots] } } }
export function groupSchedule(docs) {
  const out = {};
  for (const d of docs) {
    if (!d.course) continue;
    const course = d.course;
    const sem = String(d.semester || 1);
    const day = d.day || "Mon";
    if (!out[course]) out[course] = {};
    if (!out[course][sem]) out[course][sem] = {};
    if (!out[course][sem][day]) out[course][sem][day] = [];
    out[course][sem][day].push({
      _id: d._id,
      id: d._id,
      subjectName: d.subjectName,
      subject: d.subject,
      teacher: d.teacherName || d.teacher?.name || "",
      teacherId: d.teacher?._id || d.teacher,
      room: d.room || "",
      type: d.type || "Lecture",
      labRollStart: d.labRollStart || "",
      labRollEnd: d.labRollEnd || "",
      startTime: d.startTime,
      endTime: d.endTime,
      time: displayTime(d.startTime, d.endTime),
    });
  }
  for (const course of Object.keys(out)) {
    for (const sem of Object.keys(out[course])) {
      for (const day of Object.keys(out[course][sem])) {
        out[course][sem][day].sort(
          (a, b) => sortMinutes(a.startTime) - sortMinutes(b.startTime),
        );
      }
    }
  }
  return out;
}

// Group schedule docs into { day: [slots] } for a specific course+sem
export function groupByDay(docs) {
  const out = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [] };
  for (const d of docs) {
    const day = d.day || "Mon";
    if (!out[day]) out[day] = [];
    out[day].push({
      _id: d._id,
      id: d._id,
      subject: d.subjectName,
      subjectName: d.subjectName,
      teacher: d.teacherName || "",
      room: d.room || "",
      type: d.type || "Lecture",
      labRollStart: d.labRollStart || "",
      labRollEnd: d.labRollEnd || "",
      startTime: d.startTime,
      endTime: d.endTime,
      time: displayTime(d.startTime, d.endTime),
      course: d.course,
      sem: d.semester,
      semester: d.semester,
    });
  }
  for (const day of Object.keys(out)) {
    out[day].sort(
      (a, b) => sortMinutes(a.startTime) - sortMinutes(b.startTime),
    );
  }
  return out;
}

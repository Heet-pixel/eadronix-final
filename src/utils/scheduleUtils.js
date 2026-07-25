// Shared schedule utilities

export function to12h(t24) {
  try {
    if (!t24 || !t24.includes(':')) return t24 || '';
    let [h, m] = t24.split(':').map(Number);
    const p = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2,'0')} ${p}`;
  } catch { return t24 || ''; }
}

export function to24h(t12) {
  try {
    if (!t12) return '';
    if (/^\d{2}:\d{2}$/.test(t12)) return t12;
    const m = t12.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return '';
    let h = parseInt(m[1]), min = m[2], p = m[3].toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${min}`;
  } catch { return ''; }
}

// Group schedule docs into { course: { sem: { day: [slots] } } }
export function groupSchedule(docs) {
  const out = {};
  for (const d of docs) {
    if (!d.course) continue; // no real course on this row — nothing to group it under
    const course = d.course;
    const sem = String(d.semester || 1);
    const day = d.day || 'Mon';
    if (!out[course]) out[course] = {};
    if (!out[course][sem]) out[course][sem] = {};
    if (!out[course][sem][day]) out[course][sem][day] = [];
    out[course][sem][day].push({
      _id: d._id,
      id: d._id,
      subjectName: d.subjectName,
      subject: d.subject,
      teacher: d.teacherName || d.teacher?.name || '',
      teacherId: d.teacher?._id || d.teacher,
      room: d.room || '',
      type: d.type || 'Lecture',
      startTime: d.startTime,
      endTime: d.endTime,
      time: d.time || (d.startTime ? `${to12h(d.startTime)}${d.endTime ? ' – ' + to12h(d.endTime) : ''}` : '')
    });
  }
  return out;
}

// Group schedule docs into { day: [slots] } for a specific course+sem
export function groupByDay(docs) {
  const out = { Mon:[], Tue:[], Wed:[], Thu:[], Fri:[], Sat:[] };
  for (const d of docs) {
    const day = d.day || 'Mon';
    if (!out[day]) out[day] = [];
    out[day].push({
      _id: d._id,
      id: d._id,
      subject: d.subjectName,
      subjectName: d.subjectName,
      teacher: d.teacherName || '',
      room: d.room || '',
      type: d.type || 'Lecture',
      startTime: d.startTime,
      endTime: d.endTime,
      time: d.time || (d.startTime ? `${to12h(d.startTime)}${d.endTime ? ' – ' + to12h(d.endTime) : ''}` : ''),
      course: d.course,
      sem: d.semester,
      semester: d.semester
    });
  }
  // Sort each day by startTime
  for (const day of Object.keys(out)) {
    out[day].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }
  return out;
}

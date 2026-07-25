import { Router } from 'express';
import Student from '../models/Student.js';
import Schedule from '../models/Schedule.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fail, ok } from '../utils/respond.js';
import { mapStudent, studentBundle, validateImageDataUri } from '../controllers/common.js';
import { groupByDay } from '../utils/scheduleUtils.js';
import { streamSubjectAttendancePdf } from '../utils/pdfReport.js';
import { storeDataUri } from '../utils/gridfs.js';

const router = Router();
router.use(requireAuth, allowRoles('student', 'parent'));

async function currentStudent(req, res) {
  const q = { isDeleted: false };
  if (req.user.role === 'parent') {
    const myKids = (req.user.students?.length ? req.user.students : (req.user.student ? [req.user.student] : [])).map(String);
    if (!myKids.length) { fail(res, 404, 'No student profile linked to this parent account. Contact your HOD or Admin.'); return null; }
    const requested = req.query.studentId && myKids.includes(String(req.query.studentId)) ? req.query.studentId : myKids[0];
    q._id = requested;
  } else if (req.user.student) {
    q._id = req.user.student;
  } else {
    q.$or = [{ user: req.user.id }, { email: req.user.email }];
  }
  const student = await Student.findOne(q).populate('department', 'name shortCode');
  if (!student) { fail(res, 404, 'Student profile not found. Contact your HOD or Admin.'); return null; }
  return student;
}

// GET /api/student/my-children — for a parent account with more than one
// child in the system, lists all of them so the app can show a switcher.
router.get('/my-children', asyncHandler(async (req, res) => {
  if (req.user.role !== 'parent') return ok(res, { success: true, children: [] });
  const ids = (req.user.students?.length ? req.user.students : (req.user.student ? [req.user.student] : []));
  const children = await Student.find({ _id: { $in: ids }, isDeleted: false }).select('name roll course courseName semester sem avatar').lean();
  ok(res, { success: true, children: children.map(c => ({ id: c._id, name: c.name, roll: c.roll, course: c.course || c.courseName, semester: c.semester || c.sem, avatar: c.avatar })) });
}));

router.get('/dashboard', asyncHandler(async (req, res) => {
  const student = await currentStudent(req, res); if (!student) return;
  const data = await studentBundle(student);

  // Per-subject attendance breakdown (spec item 4: "each and every subject"
  // with its own real percentage, not just one overall average).
  const bySubject = new Map();
  for (const a of data.attendance) {
    const key = String(a.subject?._id || a.subject || a.subjectName || 'unknown');
    if (!bySubject.has(key)) {
      bySubject.set(key, { subject: { name: a.subject?.name || a.subjectName || 'Subject', code: a.subject?.code || '' }, present: 0, absent: 0, total: 0 });
    }
    const s = bySubject.get(key);
    s.total++;
    if (a.status === 'present') s.present++; else s.absent++;
  }
  const attendance = Array.from(bySubject.values()).map(s => ({
    ...s, percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
  }));

  let totalLectures = 0, presentCount = 0;
  for (const a of data.attendance) { totalLectures++; if (a.status === 'present') presentCount++; }
  const avgAttendance = totalLectures > 0 ? Math.round((presentCount / totalLectures) * 100) : 0;

  // Today's classes — filter the class's whole-week timetable down to today's day.
  const todayDayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
  const timetableToday = data.timetable
    .filter(t => t.day === todayDayName)
    .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')))
    .map(t => ({ time: t.time || `${t.startTime || ''}${t.endTime ? ' - ' + t.endTime : ''}`, subject: t.subjectName, room: t.room, type: t.type }));

  // Pending marks — subjects this student has no mark record for yet.
  const markedSubjectIds = new Set(data.marks.map(m => String(m.subject?._id || m.subject || '')));
  const pendingMarks = data.subjects.filter(s => !markedSubjectIds.has(String(s._id))).length;

  ok(res, {
    success: true,
    student: mapStudent(student),
    data: {
      student: mapStudent(student),
      stats: {
        totalSubjects: data.subjects.length,
        avgAttendance,
        totalNotices: data.notices.length,
        pendingMarks,
      },
      attendance,
      recentNotices: data.notices.slice(0, 5),
      timetableToday,
    },
  });
}));

router.get('/profile', asyncHandler(async (req, res) => {
  const student = await currentStudent(req, res); if (!student) return;
  ok(res, { success: true, student: mapStudent(student), profile: mapStudent(student) });
}));

// POST /api/student/profile/photo — upload/replace the student's own photo.
// Deliberately student-only: a linked Parent account can VIEW this (it reads
// the same Student document via currentStudent()) but cannot change it.
// One image reference (Student.avatar) — HOD list/details, Admin, Super Admin,
// and the Parent portal all read it straight from this same document, so
// there's nothing else to update or keep in sync.
router.post('/profile/photo', asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') return fail(res, 403, 'Only the student can update their own photo.');
  const student = await currentStudent(req, res); if (!student) return;
  let avatar;
  try {
    avatar = validateImageDataUri(req.body.image || req.body.avatar || req.body.photo);
  } catch (e) {
    return fail(res, e.status || 400, e.message);
  }
  student.avatar = await storeDataUri(avatar, `student-${student._id}-avatar`);
  student.updatedBy = req.user.id;
  await student.save();
  ok(res, { success: true, student: mapStudent(student) }, 'Profile photo updated.');
}));

router.get('/attendance', asyncHandler(async (req, res) => {
  const student = await currentStudent(req, res); if (!student) return;
  const data = await studentBundle(student);
  const bySubject = {};
  for (const a of data.attendance) {
    const key = String(a.subject?._id || a.subject || a.subjectName || 'unknown');
    const name = a.subject?.name || a.subjectName || 'Unknown Subject';
    if (!bySubject[key]) bySubject[key] = { name, present: 0, absent: 0, leave: 0, total: 0, records: [] };
    bySubject[key].total++;
    bySubject[key][a.status || 'present']++;
    bySubject[key].records.push({ date: a.date, status: a.status, teacher: a.teacher, type: a.type, time: a.time, division: a.division, topic: a.topic || '', isProxy: !!a.isProxy, uploadedAt: a.createdAt });
  }
  const subjects = Object.values(bySubject).map(s => ({ ...s, percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0 }));
  ok(res, { success: true, data: subjects, attendance: data.attendance, subjects, summary: subjects });
}));

// GET /api/student/attendance/pdf — download a personal attendance certificate as a real PDF.
// Available to both the student and any parent linked to them (route already allows both roles).
router.get('/attendance/pdf', asyncHandler(async (req, res) => {
  const student = await currentStudent(req, res); if (!student) return;
  const data = await studentBundle(student);
  const bySubject = {};
  for (const a of data.attendance) {
    const key = String(a.subject?._id || a.subject || a.subjectName || 'unknown');
    const name = a.subject?.name || a.subjectName || 'Unknown Subject';
    if (!bySubject[key]) bySubject[key] = { name, present: 0, absent: 0, total: 0 };
    bySubject[key].total++;
    if (a.status === 'present') bySubject[key].present++; else bySubject[key].absent++;
  }
  const rows = Object.values(bySubject).map(s => ({
    name: s.name,
    total: s.total, present: s.present, absent: s.absent,
    percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
  }));

  streamSubjectAttendancePdf(res, {
    filename: `attendance-${student.roll || student._id}.pdf`,
    title: `Attendance Certificate — ${student.name}`,
    subtitle: [student.course, student.semester ? `Semester ${student.semester}` : null, `Roll No ${student.roll || student.rollNo || '-'}`].filter(Boolean).join(' · '),
    generatedBy: req.user.name,
    rows
  });
}));

router.get('/subjects', asyncHandler(async (req, res) => {
  const student = await currentStudent(req, res); if (!student) return;
  ok(res, { success: true, subjects: (await studentBundle(student)).subjects });
}));

router.get('/syllabus', asyncHandler(async (req, res) => {
  const student = await currentStudent(req, res); if (!student) return;
  const syllabus = (await studentBundle(student)).syllabus;
  ok(res, { success: true, data: syllabus, syllabus });
}));

router.get('/notices', asyncHandler(async (req, res) => {
  const student = await currentStudent(req, res); if (!student) return;
  ok(res, { success: true, notices: (await studentBundle(student)).notices });
}));

router.get('/marks', asyncHandler(async (req, res) => {
  const student = await currentStudent(req, res); if (!student) return;
  const marks = (await studentBundle(student)).marks;
  const bySubject = {};
  for (const m of marks) {
    const key = String(m.subject?._id || m.subject || m.subjectName);
    const name = m.subject?.name || m.subjectName || 'Unknown';
    if (!bySubject[key]) bySubject[key] = { name, exams: [] };
    bySubject[key].exams.push({ examType: m.examType, marks: m.marks, maxMarks: m.maxMarks });
  }
  ok(res, { success: true, data: Object.values(bySubject), marks, bySubject: Object.values(bySubject) });
}));

// ── TIMETABLE: reads from Schedule collection (same as HOD writes to) ──────
router.get('/timetable', asyncHandler(async (req, res) => {
  const student = await currentStudent(req, res); if (!student) return;

  // Find schedule for student's college + department
  // If student has course + semester, filter by those too
  const filter = {
    college: student.college,
    department: student.department,
    isDeleted: false
  };
  if (student.course) filter.course = student.course;
  if (student.semester || student.sem) filter.semester = student.semester || student.sem;

  const docs = await Schedule.find(filter).lean();

  // Group by day
  const timetable = groupByDay(docs);

  // Also return raw array
  ok(res, {
    success: true,
    timetable,
    data: timetable, // alias for old client code
    schedule: timetable,
    total: docs.length
  });
}));

export default router;

import { Router } from "express";
import Student from "../models/Student.js";
import Subject from "../models/Subject.js";
import Notice from "../models/Notice.js";
import Attendance from "../models/Attendance.js";
import Mark from "../models/Mark.js";
import Syllabus from "../models/Syllabus.js";
import Schedule from "../models/Schedule.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, fail } from "../utils/respond.js";
import {
  live,
  mapStudent,
  resolveSubjectForSlot,
  validateImageDataUri,
  findAttendanceTimeConflict,
  validatePdfDataUri,
  validateAttendanceDateIsNotInTheFuture,
  validateLectureDuration,
} from "../controllers/common.js";
import { hardDeleteCascade } from "../utils/hardDelete.js";
import { storeDataUri } from "../utils/gridfs.js";
import { groupByDay } from "../utils/scheduleUtils.js";
import { streamAttendanceReportPdf } from "../utils/pdfReport.js";

const router = Router();
router.get("/test", (req, res) => {
  res.json({ ok: true });
});
console.log("✅ teacher.routes.js loaded");
router.use(requireAuth, allowRoles("teacher"));

const scope = (req) => ({
  college: req.user.college,
  department: req.user.department,
  ...live,
});

router.get(
  "/me",
  asyncHandler(async (req, res) => ok(res, { success: true, user: req.user })),
);

// ── Teacher Profile (spec item 7) ───────────────────────────────────────────
// "Existing editable fields only": a teacher can update their own contact
// details, not organisational fields like designation/status/course/subject
// assignment — those stay HOD/Admin-controlled (see hod.routes.js PUT /teachers/:id).
router.get(
  "/profile",
  asyncHandler(async (req, res) =>
    ok(res, { success: true, profile: req.user }),
  ),
);

// Spec (updated): a teacher's profile is now VIEW-ONLY — no self-editable
// fields at all, only the photo (below) can be changed here. Contact/personal
// details are edited by HOD/Admin from HOD -> Teacher Details instead.
router.put(
  "/profile",
  asyncHandler(async (req, res) => {
    fail(
      res,
      403,
      "Profile details cannot be edited here. Ask your HOD to update them. You can still update your photo.",
    );
  }),
);

// One image reference (User.avatar) — HOD's teacher list/details, Admin, and
// Super Admin all read it straight off this same document, same as the
// student photo endpoint. Nothing else to keep in sync.
router.post(
  "/profile/photo",
  asyncHandler(async (req, res) => {
    let avatar;
    try {
      avatar = validateImageDataUri(
        req.body.image || req.body.avatar || req.body.photo,
      );
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }
    req.user.avatar = await storeDataUri(
      avatar,
      `teacher-${req.user.id}-avatar`,
    );
    req.user.updatedBy = req.user.id;
    await req.user.save();
    ok(res, { success: true, profile: req.user }, "Profile photo updated.");
  }),
);

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [subjects, students, attendanceDocs, notices] = await Promise.all([
      Subject.countDocuments({
        ...scope(req),
        teacher: req.user.id,
      }),

      Student.countDocuments(scope(req)),

      Attendance.find({
        teacher: req.user.id,
        ...live,
      })
        .select("course semester subject division time date")
        .lean(),

      Notice.countDocuments({
        college: req.user.college,
        $or: [{ department: req.user.department }, { department: null }],
        $and: [
          {
            $or: [
              { targetRole: "all" },
              { targetRole: { $exists: false } },
              { targetRole: "teacher" },
            ],
          },
          {
            $or: [
              { targetTeacherIds: { $size: 0 } },
              { targetTeacherIds: { $exists: false } },
              { targetTeacherIds: req.user.id },
            ],
          },
        ],
        ...live,
      }),
    ]);

    // Count unique attendance sessions (not individual students)
    const sessions = new Set();

    attendanceDocs.forEach((d) => {
      const day = new Date(d.date).toISOString().slice(0, 10);

      sessions.add(
        `${d.course}|${d.semester}|${String(d.subject)}|${d.division}|${d.time}|${day}`,
      );
    });

    const attendanceUploaded = sessions.size;

    ok(res, {
      success: true,
      subjects,
      students,
      attendanceUploaded,
      notices,
    });
  }),
);

router.get(
  "/subjects",
  asyncHandler(async (req, res) => {
    const subjects = await Subject.find(scope(req))
      .populate("teacher", "name email")
      .lean();
    ok(res, {
      success: true,
      subjects: subjects.map((s) => ({
        ...s,
        isAssignedToMe:
          !s.teacher ||
          String(s.teacher?._id || s.teacher) === String(req.user.id),
      })),
    });
  }),
);

router.get(
  "/classes",
  asyncHandler(async (req, res) => {
    const [studentRows, subjectRows] = await Promise.all([
      Student.find(scope(req)).select("course courseName semester sem").lean(),
      Subject.find(scope(req))
        .select("course courseName semester sem name")
        .lean(),
    ]);
    const byCourse = new Map();
    const addClass = (row) => {
      const course = row.course || row.courseName;
      if (!course) return;
      const semester = Number(row.semester || row.sem || 1);
      if (!byCourse.has(course)) byCourse.set(course, new Set());
      byCourse.get(course).add(semester);
    };
    studentRows.forEach(addClass);
    subjectRows.forEach(addClass);
    const classes = [...byCourse.entries()]
      .map(([course, sems]) => ({
        course,
        semesters: [...sems].filter(Boolean).sort((a, b) => a - b),
      }))
      .sort((a, b) => a.course.localeCompare(b.course));
    ok(res, { success: true, classes });
  }),
);

// GET /api/teacher/my-classes — ONLY the course+semester combinations this
// teacher is actually assigned to teach (has a Subject with teacher=me).
// Used to restrict "send notice to students" so a teacher can't notify a
// class they have nothing to do with.
router.get(
  "/my-classes",
  asyncHandler(async (req, res) => {
    const mySubjects = await Subject.find({
      ...scope(req),
      teacher: req.user.id,
    })
      .select("course courseName semester sem")
      .lean();
    const byCourse = new Map();
    mySubjects.forEach((s) => {
      const course = s.course || s.courseName;
      if (!course) return;
      const semester = Number(s.semester || s.sem || 1);
      if (!byCourse.has(course)) byCourse.set(course, new Set());
      byCourse.get(course).add(semester);
    });
    const classes = [...byCourse.entries()]
      .map(([course, sems]) => ({
        course,
        semesters: [...sems].filter(Boolean).sort((a, b) => a - b),
      }))
      .sort((a, b) => a.course.localeCompare(b.course));
    ok(res, { success: true, classes });
  }),
);

// POST /api/teacher/notices — teacher sends a notice straight to students of
// one of their own assigned classes. Shows up in that class's unified
// Notices feed (sourceType 'notice', targetRole 'student').
router.post(
  "/notices",
  asyncHandler(async (req, res) => {
    const { title } = req.body;
    const course = req.body.course;
    const semester = Number(req.body.semester || req.body.sem);
    if (!title || !course || !semester)
      return fail(res, 400, "Title, course and semester are required.");

    const owns = await Subject.exists({
      ...scope(req),
      teacher: req.user.id,
      course,
      $or: [{ semester }, { sem: semester }],
    });
    if (!owns)
      return fail(
        res,
        403,
        "You can only send notices to a class you are assigned to teach.",
      );

    let attachment, attachmentName;
    if (req.body.attachment) {
      const raw = String(req.body.attachment);
      const approxBytes = Math.floor(raw.length * 0.75);
      if (approxBytes > 5 * 1024 * 1024)
        return fail(res, 400, "Attachment is too large (max 5MB).");
      attachment = await storeDataUri(raw, `teacher-notice-${Date.now()}`);
      attachmentName = req.body.attachmentName || "Notice attachment";
    }

    const notice = await Notice.create({
      title,
      body: req.body.body || "",
      message: req.body.body || "",
      sourceType: "notice",
      targetRole: "student",
      course,
      semester,
      attachment,
      attachmentName,
      college: req.user.college,
      department: req.user.department,
      author: req.user.id,
      createdBy: req.user.id,
    });
    ok(res, { success: true, notice }, "Notice sent to your students.");
  }),
);

router.get(
  "/students",
  asyncHandler(async (req, res) => {
    const filter = scope(req);
    const and = [];
    if (req.query.course)
      and.push({
        $or: [{ course: req.query.course }, { courseName: req.query.course }],
      });
    if (req.query.semester)
      and.push({
        $or: [
          { semester: Number(req.query.semester) },
          { sem: Number(req.query.semester) },
        ],
      });
    if (and.length) filter.$and = and;
    const [students, subjects, mySubjects] = await Promise.all([
      Student.find(filter).lean(),
      Subject.find(scope(req)).lean(),
      Subject.find({ ...scope(req), teacher: req.user.id }).lean(),
    ]);
    const allAttendance = await Attendance.find({
      teacher: req.user.id,
      ...live,
    }).lean();
    const attendanceSummary = {};
    for (const a of allAttendance) {
      const sid = String(a.student);
      if (!attendanceSummary[sid])
        attendanceSummary[sid] = { total: 0, present: 0, absent: 0 };
      attendanceSummary[sid].total++;
      if (a.status === "present") attendanceSummary[sid].present++;
      else attendanceSummary[sid].absent++;
    }
    ok(res, {
      success: true,
      students: students.map(mapStudent),
      subjects,
      mySubjects,
      attendanceSummary,
    });
  }),
);

// GET /api/teacher/students/:studentId/attendance — per-subject SUMMARY of every
// lecture THIS teacher has personally marked for this student (course/semester
// scoped). Used by the student-list modal to answer "what attendance has this
// teacher recorded for this student so far".
router.get(
  "/students/:studentId/attendance",
  asyncHandler(async (req, res) => {
    const student = await Student.findOne({
      _id: req.params.studentId,
      college: req.user.college,
      department: req.user.department,
    }).lean();

    if (!student) {
      return fail(res, 404, "Student not found.");
    }

    const filter = {
      student: student._id,
      teacher: req.user.id,
      ...live,
    };
    if (req.query.course) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);

    const records = await Attendance.find(filter)
      .populate("subject", "name code")
      .sort({ date: -1 });

    const bySubject = {};
    for (const a of records) {
      const name = a.subject?.name || a.subjectName || "Unknown Subject";
      if (!bySubject[name]) bySubject[name] = { name, present: 0, absent: 0, total: 0 };
      bySubject[name].total++;
      if (a.status === "present") bySubject[name].present++;
      else bySubject[name].absent++;
    }
    const subjects = Object.values(bySubject).sort((a, b) => a.name.localeCompare(b.name));

    ok(res, {
      success: true,
      student: mapStudent(student),
      subjects,
    });
  }),
);

// GET /api/teacher/students/:studentId/attendance/subject?subject=NAME — full
// lecture-by-lecture log (with topic + date) for one subject, scoped to this
// teacher's own submitted records for this student.
router.get(
  "/students/:studentId/attendance/subject",
  asyncHandler(async (req, res) => {
    const subjectName = String(req.query.subject || "").trim();

    const student = await Student.findOne({
      _id: req.params.studentId,
      college: req.user.college,
      department: req.user.department,
    });

    if (!student) {
      return fail(res, 404, "Student not found.");
    }

    const records = await Attendance.find({
      student: student._id,
      teacher: req.user.id,
      ...live,
    })
      .populate("subject", "name code")
      .sort({ date: -1 });

    const lectures = records
      .filter((a) => {
        const name = a.subject?.name || a.subjectName || "";
        return name === subjectName;
      })
      .map((a) => ({
        id: a._id,
        date: new Date(a.date).toLocaleDateString("en-IN"),
        status: a.status,
        topic: a.topic || "",
        time: a.time || "",
        type: a.type || "",
      }));

    ok(res, {
      success: true,
      attendance: {
        subject: subjectName,
        total: lectures.length,
        present: lectures.filter((l) => l.status === "present").length,
        absent: lectures.filter((l) => l.status === "absent").length,
        lectures,
      },
    });
  }),
);

// POST /api/teacher/attendance
// Spec item 5: the subject must NEVER be manually typed. It must resolve against
// the Admin-created master Subject list for this course/department/semester —
// resolveSubjectForSlot throws if it doesn't, and we reject the whole request.
// We also confirm the teacher is actually allowed to teach this subject: either
// the subject has no teacher assigned yet, or it's assigned to this teacher.
router.post(
  "/attendance",
  asyncHandler(async (req, res) => {
    const rows = req.body.records || req.body.attendance || [];
    if (!Array.isArray(rows) || !rows.length) {
      ok(res, { success: false, message: "No records" });
      return;
    }
    const subjectInput =
      req.body.subjectId || req.body.subject || req.body.subjectName || "";
    const course = req.body.course || "";
    const semester =
      Number(req.body.semester || req.body.sem || 0) || undefined;
    if (!subjectInput)
      return fail(
        res,
        400,
        "Subject is required and must be selected from the assigned subject list.",
      );
    if (!course || !semester)
      return fail(res, 400, "Course and semester are required.");

    let subjectDoc;
    try {
      subjectDoc = await resolveSubjectForSlot({
        college: req.user.college,
        department: req.user.department,
        course,
        semester,
        subjectId: req.body.subjectId,
        subjectName: req.body.subjectName || req.body.subject,
      });
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }
    if (
      subjectDoc.teacher &&
      String(subjectDoc.teacher) !== String(req.user.id) &&
      !req.body.isProxy
    ) {
      return fail(
        res,
        403,
        `You are not the assigned teacher for "${subjectDoc.name}". Contact your HOD if this is incorrect.`,
      );
    }

    const sessionDate = req.body.date ? new Date(req.body.date) : new Date();
    const division = req.body.division || "";
    const type = req.body.type || subjectDoc.type || "Lecture";
    const time = req.body.time || "";
    const topic = String(req.body.topic || "").trim();
    const isProxy = Boolean(req.body.isProxy);

    const dateCheck = validateAttendanceDateIsNotInTheFuture(sessionDate);
    if (!dateCheck.ok) return fail(res, 400, dateCheck.message);

    const [attendanceStartTime, attendanceEndTime] = time.split(/\s*[-–]\s*/);
    if (attendanceStartTime && attendanceEndTime) {
      const durationCheck = validateLectureDuration(
        attendanceStartTime,
        attendanceEndTime,
      );
      if (!durationCheck.ok) return fail(res, 400, durationCheck.message);
    }

    // Spec item 9: no duplicate attendance/lecture records. If this exact
    // lecture (same teacher+class+subject+division+time+calendar day) was
    // already submitted — e.g. a double-click, a slow network causing a retry,
    // or a genuine accidental re-submit — reject it here rather than silently
    // inserting a second copy that would inflate the lecture count and skew
    // percentages. The teacher edits the existing one via Attendance History instead.
    const dayStart = new Date(sessionDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(sessionDate);
    dayEnd.setHours(23, 59, 59, 999);
    const alreadyExists = await Attendance.findOne({
      teacher: req.user.id,
      ...live,
      course: req.body.course || course,
      semester,
      subject: subjectDoc._id,
      division,
      time,
      date: { $gte: dayStart, $lte: dayEnd },
    })
      .select("_id")
      .lean();
    if (alreadyExists) {
      return fail(
        res,
        409,
        "Attendance for this exact lecture has already been submitted today. Use Attendance History to edit it instead of submitting again.",
      );
    }

    // Spec item 4: no two teachers may mark attendance for overlapping time on
    // the same class/day — mirrors the timetable's conflict rule, but checked
    // against actual submitted attendance (a teacher's marking form takes a
    // free-typed time, not necessarily an exact Schedule slot).
    const timeConflict = await findAttendanceTimeConflict({
      college: req.user.college,
      department: req.user.department,
      course: req.body.course || course,
      semester,
      division,
      date: sessionDate,
      startTime: attendanceStartTime || "",
      endTime: attendanceEndTime || "",
      excludeTeacher: req.user.id,
    });
    if (timeConflict) return fail(res, 409, timeConflict.message);

    const docs = await Attendance.insertMany(
      rows.map((r) => ({
        student: r.student || r.studentId,
        status: r.status,
        course: r.course || course,
        semester: Number(r.semester || r.sem || semester) || undefined,
        subject: subjectDoc._id,
        subjectName: subjectDoc.name,
        division,
        type,
        time,
        topic,
        isProxy,
        proxyForSubject: isProxy ? subjectDoc._id : undefined,
        proxyForSubjectName: isProxy ? subjectDoc.name : "",
        college: req.user.college,
        department: req.user.department,
        teacher: req.user.id,
        date: sessionDate,
      })),
    );
    ok(res, { success: true, saved: docs.length });
  }),
);

// ── Attendance History (spec item 4) ────────────────────────────────────────
// A "lecture session" = every Attendance doc this teacher created with the
// same (course, semester, subject, division, time, calendar day). We don't
// store a separate session id — we derive a stable, URL-safe key from those
// identity fields, so History/detail/edit all agree on what "one lecture" is
// without a schema migration or a background job to backfill one.
function dayKey(d) {
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}
function encodeSessionKey(parts) {
  return Buffer.from(JSON.stringify(parts)).toString("base64url");
}
function decodeSessionKey(key) {
  try {
    return JSON.parse(Buffer.from(String(key), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// GET /api/teacher/attendance/history — one row per lecture ever submitted by this teacher.
router.get(
  "/attendance/history",
  asyncHandler(async (req, res) => {
    const filter = { teacher: req.user.id, ...live };
    if (req.query.course) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    const docs = await Attendance.find(filter)
      .select(
        "date course semester subject subjectName division time type status topic isProxy",
      )
      .lean();

    const sessions = new Map();
    for (const d of docs) {
      const parts = {
        course: d.course,
        semester: d.semester,
        subject: d.subject ? String(d.subject) : null,
        subjectName: d.subjectName || "",
        division: d.division || "",
        time: d.time || "",
        day: dayKey(d.date),
      };
      const key = encodeSessionKey(parts);
      if (!sessions.has(key)) {
        sessions.set(key, {
          sessionKey: key,
          date: d.date,
          day: parts.day,
          time: d.time || "",
          subjectName: d.subjectName,
          course: d.course,
          semester: d.semester,
          division: d.division || "",
          type: d.type || "Lecture",
          topic: d.topic || "",
          isProxy: !!d.isProxy,
          department: req.user.department,
          present: 0,
          absent: 0,
          total: 0,
        });
      }
      const s = sessions.get(key);
      s.total++;
      if (d.status === "present") s.present++;
      else s.absent++;
    }
    const list = Array.from(sessions.values()).sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
    ok(res, { success: true, sessions: list });
  }),
);

// GET /api/teacher/attendance/session/:sessionKey — full per-student detail for one lecture.
// Matches by re-deriving each candidate's key with the exact same function
// used to build the History list, then comparing strings — this guarantees
// list and detail always agree (no Mongo-query-casting edge case can cause a
// false "not found", since nothing here is re-expressed as a query filter).
router.get(
  "/attendance/session/:sessionKey",
  asyncHandler(async (req, res) => {
    const parts = decodeSessionKey(req.params.sessionKey);
    if (!parts) return fail(res, 400, "Invalid session reference.");
    const candidates = await Attendance.find({
      teacher: req.user.id,
      ...live,
      course: parts.course,
      semester: parts.semester,
    })
      .populate("student", "name roll rollNo")
      .lean();
    const records = candidates.filter(
      (d) =>
        encodeSessionKey({
          course: d.course,
          semester: d.semester,
          subject: d.subject ? String(d.subject) : null,
          subjectName: d.subjectName || "",
          division: d.division || "",
          time: d.time || "",
          day: dayKey(d.date),
        }) === req.params.sessionKey,
    );
    if (!records.length)
      return fail(res, 404, "This lecture record was not found.");
    ok(res, {
      success: true,
      sessionKey: req.params.sessionKey,
      meta: {
        subjectName: records[0].subjectName,
        course: parts.course,
        semester: parts.semester,
        division: parts.division,
        time: parts.time,
        day: parts.day,
        type: records[0].type,
        topic: records[0].topic || "",
        isProxy: !!records[0].isProxy,
        date: records[0].date,
        uploadedAt: records[0].createdAt,
      },
      records: records.map((r) => ({
        id: r._id,
        student: r.student,
        status: r.status,
      })),
    });
  }),
);

// PUT /api/teacher/attendance/session/:sessionKey — edit an already-submitted lecture.
// Spec item 4: this must NOT create a new lecture — it only changes the status
// on the existing Attendance documents for this exact session. The lecture's
// identity (date/subject/course/semester/division/time) is immutable here;
// only per-student status can change. Total lecture count therefore never
// changes from an edit, and percentages recompute automatically because
// they're always derived live from these same documents (nothing cached).
router.put(
  "/attendance/session/:sessionKey",
  asyncHandler(async (req, res) => {
    const parts = decodeSessionKey(req.params.sessionKey);
    if (!parts) return fail(res, 400, "Invalid session reference.");
    const records = req.body.records || [];
    if (!Array.isArray(records) || !records.length)
      return fail(res, 400, "No records to update.");

    // Same JS-side matching as the GET above — find the exact documents behind
    // this session key first, then update those documents by _id. Nothing here
    // is re-expressed as a filter that could drift from how the key was built.
    const candidates = await Attendance.find({
      teacher: req.user.id,
      ...live,
      course: parts.course,
      semester: parts.semester,
    }).lean();
    const sessionDocs = candidates.filter(
      (d) =>
        encodeSessionKey({
          course: d.course,
          semester: d.semester,
          subject: d.subject ? String(d.subject) : null,
          subjectName: d.subjectName || "",
          division: d.division || "",
          time: d.time || "",
          day: dayKey(d.date),
        }) === req.params.sessionKey,
    );
    if (!sessionDocs.length)
      return fail(res, 404, "This lecture record was not found.");
    const byStudent = new Map(
      sessionDocs.map((d) => [String(d.student), d._id]),
    );

    let updated = 0;
    for (const r of records) {
      if (!r.student || !["present", "absent", "leave"].includes(r.status))
        continue;
      const docId = byStudent.get(String(r.student));
      if (!docId) continue;
      const result = await Attendance.updateOne(
        { _id: docId },
        { $set: { status: r.status, updatedBy: req.user.id } },
      );
      if (result.matchedCount) updated++;
    }
    if (!updated)
      return fail(res, 404, "No matching students to update for this lecture.");
    ok(
      res,
      { success: true, updated },
      `Attendance updated for ${updated} student(s). Lecture record unchanged — no new lecture was created.`,
    );
  }),
);

router.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const filter = { teacher: req.user.id, ...live };
    if (req.query.studentId) filter.student = req.query.studentId;
    if (req.query.date)
      filter.date = {
        $gte: new Date(req.query.date),
        $lte: new Date(new Date(req.query.date).setHours(23, 59, 59)),
      };
    ok(res, {
      success: true,
      logs: await Attendance.find(filter)
        .populate("student", "name roll")
        .populate("subject", "name code")
        .sort({ date: -1 })
        .limit(500),
    });
  }),
);

// GET /api/teacher/attendance-report — per-student summary for classes THIS teacher taught.
// Scoped to teacher: req.user.id so a teacher only ever sees attendance they themselves marked.
router.get(
  "/attendance-report",
  asyncHandler(async (req, res) => {
    const filter = { teacher: req.user.id, ...live };
    if (req.query.course) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    const attendance = await Attendance.find(filter)
      .populate("student", "name roll course sem semester")
      .populate("subject", "name code");
    const summary = {};
    for (const a of attendance) {
      const sid = String(a.student?._id || a.student);
      if (!summary[sid])
        summary[sid] = {
          student: a.student,
          subjects: {},
          total: 0,
          present: 0,
          absent: 0,
        };
      const sk = String(a.subject?._id || a.subject || a.subjectName || "x");
      if (!summary[sid].subjects[sk])
        summary[sid].subjects[sk] = {
          name: a.subject?.name || a.subjectName || "Unknown",
          total: 0,
          present: 0,
          absent: 0,
        };
      summary[sid].subjects[sk].total++;
      summary[sid].total++;
      if (a.status === "present") {
        summary[sid].subjects[sk].present++;
        summary[sid].present++;
      } else {
        summary[sid].subjects[sk].absent++;
        summary[sid].absent++;
      }
    }
    const summaryArr = Object.values(summary).map((s) => ({
      ...s,
      subjects: Object.values(s.subjects).map((sub) => ({
        ...sub,
        percentage:
          sub.total > 0 ? Math.round((sub.present / sub.total) * 100) : 0,
      })),
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
    }));
    ok(res, { success: true, attendance, summary: summaryArr });
  }),
);

// GET /api/teacher/attendance-report/pdf — server-rendered PDF version of the report above.
router.get(
  "/attendance-report/pdf",
  asyncHandler(async (req, res) => {
    const filter = { teacher: req.user.id, ...live };
    if (req.query.course) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    const attendance = await Attendance.find(filter).populate(
      "student",
      "name roll",
    );
    const summary = {};
    for (const a of attendance) {
      const sid = String(a.student?._id || a.student);
      if (!summary[sid])
        summary[sid] = { student: a.student, total: 0, present: 0, absent: 0 };
      summary[sid].total++;
      if (a.status === "present") summary[sid].present++;
      else summary[sid].absent++;
    }
    const rows = Object.values(summary)
      .map((s) => ({
        name: s.student?.name || "Unknown",
        roll: s.student?.roll || s.student?.rollNo || "-",
        total: s.total,
        present: s.present,
        absent: s.absent,
        percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
      }))
      .sort((a, b) =>
        a.roll.localeCompare(b.roll, undefined, { numeric: true }),
      );

    streamAttendanceReportPdf(res, {
      title: "Attendance Report — My Classes",
      subtitle:
        [
          req.query.course,
          req.query.semester ? `Semester ${req.query.semester}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "All my classes",
      generatedBy: req.user.name,
      rows,
    });
  }),
);

// POST /api/teacher/syllabus — log a topic covered. This always also creates
// a linked Notice (sourceType 'syllabus') so students in that exact
// course+semester see it in their unified Notices feed — one save, one form.
// (Previously this only happened when a file was attached; now every entry
// shows up, since the standalone student-side Syllabus page was removed in
// favour of the single Notices inbox.)
router.post(
  "/syllabus",
  asyncHandler(async (req, res) => {
    const { course, topic } = req.body;
    const semester = Number(req.body.semester || req.body.sem);
    if (!course || !semester || !topic)
      return fail(res, 400, "Course, semester and topic are required.");

    let subjectDoc;
    try {
      subjectDoc = await resolveSubjectForSlot({
        college: req.user.college,
        department: req.user.department,
        course,
        semester,
        subjectId: req.body.subjectId,
        subjectName: req.body.subject,
      });
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }

    let attachment, attachmentName;
    if (req.body.attachment) {
      // Broader than PDF-only here — this form already advertises Word/PPT/
      // images too. Re-uses the same size ceiling and data-URI approach.
      const raw = String(req.body.attachment);
      const approxBytes = Math.floor(raw.length * 0.75);
      if (approxBytes > 5 * 1024 * 1024)
        return fail(res, 400, "Attachment is too large (max 5MB).");
      attachment = await storeDataUri(raw, `syllabus-${Date.now()}`);
      attachmentName = req.body.attachmentName || "Syllabus attachment";
    }

    const syllabus = await Syllabus.create({
      ...req.body,
      subject: subjectDoc._id,
      course,
      semester,
      attachment,
      attachmentName,
      college: req.user.college,
      department: req.user.department,
      teacher: req.user.id,
      createdBy: req.user.id,
    });

    await Notice.create({
      title: topic,
      message: req.body.desc || "",
      body: req.body.desc || "",
      sourceType: "syllabus",
      course,
      semester,
      attachment,
      attachmentName,
      college: req.user.college,
      department: req.user.department,
      author: req.user.id,
      createdBy: req.user.id,
    });

    ok(res, {
      success: true,
      syllabus,
      entry: { ...syllabus.toJSON(), subjectName: subjectDoc.name },
    });
  }),
);
router.get(
  "/syllabus",
  asyncHandler(async (req, res) => {
    ok(res, {
      success: true,
      entries: await Syllabus.find({
        ...scope(req),
        teacher: req.user.id,
      }).populate("subject", "name"),
    });
  }),
);

// ── SCHEDULE: read from shared Schedule collection ─────────────────────────
// Teacher sees THEIR OWN schedule — every slot in the department where they
// are the assigned teacher. (Previously this returned every slot in the
// whole department regardless of teacher — every teacher was seeing every
// other teacher's lectures as if they were their own. Fixed.)
router.get(
  "/schedule",
  asyncHandler(async (req, res) => {
    const filter = { ...scope(req), teacher: req.user.id };
    if (req.query.course) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);

    const docs = await Schedule.find(filter).lean();

    // Return grouped by day (teacher timetable view)
    // Also return full nested: { course: { sem: { day: [slots] } } }
    const timetable = groupByDay(docs);
    const nested = {};
    for (const d of docs) {
      if (!d.course) continue;
      const c = d.course;
      const s = String(d.semester || 1);
      const day = d.day || "Mon";
      if (!nested[c]) nested[c] = {};
      if (!nested[c][s]) nested[c][s] = {};
      if (!nested[c][s][day]) nested[c][s][day] = [];
      nested[c][s][day].push({
        subject: d.subjectName,
        time: d.time,
        room: d.room,
        type: d.type,
        course: d.course,
        sem: d.semester,
      });
    }

    ok(res, { success: true, schedule: nested, timetable });
  }),
);

router.get(
  "/announcements",
  asyncHandler(async (req, res) => {
    const notices = await Notice.find({
      college: req.user.college,
      $or: [
        { department: req.user.department },
        { department: null },
        { department: { $exists: false } },
      ],
      $and: [
        {
          $or: [
            { targetRole: "all" },
            { targetRole: { $exists: false } },
            { targetRole: "teacher" },
          ],
        },
        {
          $or: [
            { targetTeacherIds: { $size: 0 } },
            { targetTeacherIds: { $exists: false } },
            { targetTeacherIds: req.user.id },
          ],
        },
      ],
      ...live,
    })
      .sort({ date: -1, createdAt: -1 })
      .populate("author", "name");
    ok(res, { success: true, announcements: notices });
  }),
);

// ── Marks (teacher can view and enter marks) ─────────────────────────
router.get(
  "/marks",
  asyncHandler(async (req, res) => {
    const filter = {
      college: req.user.college,
      department: req.user.department,
      isDeleted: false,
    };
    if (req.query.studentId) filter.student = req.query.studentId;
    if (req.query.subjectId) filter.subject = req.query.subjectId;
    const marks = await Mark.find(filter)
      .populate("student", "name roll")
      .populate("subject", "name code")
      .lean();
    ok(res, { success: true, marks });
  }),
);

router.post(
  "/marks",
  asyncHandler(async (req, res) => {
    const records = Array.isArray(req.body)
      ? req.body
      : req.body.records || [req.body];
    const docs = await Mark.insertMany(
      records.map((r) => ({
        ...r,
        college: req.user.college,
        department: req.user.department,
        teacher: req.user.id,
        createdBy: req.user.id,
      })),
      { ordered: false },
    );
    ok(res, { success: true, marks: docs }, "Marks saved.");
  }),
);

// POST /api/teacher/marks/bulk-upsert — save a marks sheet without duplicating rows on re-save.
// Matches existing marks on (student, subject, examType); updates if found, creates otherwise.
router.post(
  "/marks/bulk-upsert",
  asyncHandler(async (req, res) => {
    const records = Array.isArray(req.body) ? req.body : req.body.records || [];
    if (!records.length)
      return ok(res, {
        success: false,
        message: "At least one mark record is required.",
      });
    const results = await Promise.all(
      records.map((r) => {
        if (!r.student || !r.subject || !r.examType) return null;
        return Mark.findOneAndUpdate(
          {
            student: r.student,
            subject: r.subject,
            examType: r.examType,
            college: req.user.college,
            department: req.user.department,
            ...live,
          },
          {
            $set: {
              marks: r.marks,
              maxMarks: r.maxMarks || 100,
              subjectName: r.subjectName,
              teacher: req.user.id,
              updatedBy: req.user.id,
            },
            $setOnInsert: {
              student: r.student,
              subject: r.subject,
              examType: r.examType,
              college: req.user.college,
              department: req.user.department,
              createdBy: req.user.id,
            },
          },
          { upsert: true, new: true },
        );
      }),
    );
    const saved = results.filter(Boolean);
    ok(
      res,
      { success: true, marks: saved, saved: saved.length },
      `${saved.length} mark(s) saved.`,
    );
  }),
);

router.put(
  "/marks/:id",
  asyncHandler(async (req, res) => {
    const mark = await Mark.findOneAndUpdate(
      {
        _id: req.params.id,
        college: req.user.college,
        department: req.user.department,
        teacher: req.user.id,
      },
      { ...req.body, updatedBy: req.user.id },
      { new: true },
    );
    if (!mark) {
      ok(res, { success: false, message: "Mark not found." });
      return;
    }
    ok(res, { success: true, mark }, "Mark updated.");
  }),
);

router.delete(
  "/marks/:id",
  asyncHandler(async (req, res) => {
    const mark = await Mark.findOne({
      _id: req.params.id,
      college: req.user.college,
      department: req.user.department,
      teacher: req.user.id,
    });
    if (!mark) return fail(res, 404, "Mark not found.");
    await hardDeleteCascade(mark, req.user);
    ok(res, { success: true }, "Mark permanently deleted.");
  }),
);

export default router;

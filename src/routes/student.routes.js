import { Router } from "express";
import Student from "../models/Student.js";
import Schedule from "../models/Schedule.js";
import Mark from "../models/Mark.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fail, ok } from "../utils/respond.js";
import {
  mapStudent,
  studentBundle,
  validateImageDataUri,
} from "../controllers/common.js";
import { groupByDay, to12h } from "../utils/scheduleUtils.js";
import { streamSubjectAttendancePdf } from "../utils/pdfReport.js";
import { storeDataUri, storeAvatarDataUri } from "../utils/gridfs.js";
import { refreshS3Url } from "../utils/s3Storage.js";

const router = Router();
router.use(requireAuth, allowRoles("student", "parent"));

// Refresh the avatar URL on every outbound student object so the browser
// always receives a valid pre-signed S3 URL and never a stale/expired one.
// mapStudent() is synchronous so we can't call refreshS3Url inside it —
// instead every route that sends a student object goes through this wrapper.
async function withFreshAvatar(studentObj) {
  if (!studentObj) return studentObj;
  studentObj.avatar = await refreshS3Url(studentObj.avatar);
  return studentObj;
}

function rollInRange(roll, start, end) {
  if (!start && !end) return true;
  const value = String(roll || "").trim();
  const from = String(start || "").trim();
  const to = String(end || "").trim();
  if (!value || !from || !to) return false;
  if (/^\d+$/.test(value) && /^\d+$/.test(from) && /^\d+$/.test(to)) {
    const n = BigInt(value);
    const a = BigInt(from);
    const b = BigInt(to);
    return n >= (a < b ? a : b) && n <= (a < b ? b : a);
  }
  const low =
    from.localeCompare(to, undefined, { numeric: true }) <= 0 ? from : to;
  const high = low === from ? to : from;
  return (
    value.localeCompare(low, undefined, { numeric: true }) >= 0 &&
    value.localeCompare(high, undefined, { numeric: true }) <= 0
  );
}

function timetableSortMinutes(t24) {
  if (!t24 || !t24.includes(":")) return Number.MAX_SAFE_INTEGER;
  let [h, m] = t24.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return Number.MAX_SAFE_INTEGER;
  if (h >= 1 && h < 7) h += 12;
  return h * 60 + m;
}

function timetableDisplayTime(startTime, endTime) {
  return startTime
    ? `${to12h(startTime)}${endTime ? " - " + to12h(endTime) : ""}`
    : "";
}

async function currentStudent(req, res) {
  const q = { isDeleted: false };
  if (req.user.role === "parent") {
    const myKids = (
      req.user.students?.length
        ? req.user.students
        : req.user.student
          ? [req.user.student]
          : []
    ).map(String);
    if (!myKids.length) {
      fail(
        res,
        404,
        "No student profile linked to this parent account. Contact your HOD or Admin.",
      );
      return null;
    }
    const requested =
      req.query.studentId && myKids.includes(String(req.query.studentId))
        ? req.query.studentId
        : myKids[0];
    q._id = requested;
  } else if (req.user.student) {
    q._id = req.user.student;
  } else {
    q.$or = [{ user: req.user.id }, { email: req.user.email }];
  }
  const student = await Student.findOne(q).populate(
    "department",
    "name shortCode",
  );
  if (!student) {
    fail(res, 404, "Student profile not found. Contact your HOD or Admin.");
    return null;
  }
  return student;
}

// GET /api/student/my-children — for a parent account with more than one
// child in the system, lists all of them so the app can show a switcher.
router.get(
  "/my-children",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "parent")
      return ok(res, { success: true, children: [] });
    const ids = req.user.students?.length
      ? req.user.students
      : req.user.student
        ? [req.user.student]
        : [];
    const children = await Student.find({ _id: { $in: ids }, isDeleted: false })
      .select("name roll course courseName semester sem avatar")
      .lean();
    ok(res, {
      success: true,
      children: children.map((c) => ({
        id: c._id,
        name: c.name,
        roll: c.roll,
        course: c.course || c.courseName,
        semester: c.semester || c.sem,
        avatar: c.avatar,
      })),
    });
  }),
);

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const student = await currentStudent(req, res);
    if (!student) return;
    const data = await studentBundle(student);

    // Per-subject attendance breakdown (spec item 4: "each and every subject"
    // with its own real percentage, not just one overall average).
    const bySubject = new Map();
    for (const a of data.attendance) {
      const key = String(
        a.subject?._id || a.subject || a.subjectName || "unknown",
      );
      if (!bySubject.has(key)) {
        bySubject.set(key, {
          subject: {
            name: a.subject?.name || a.subjectName || "Subject",
            code: a.subject?.code || "",
          },
          present: 0,
          absent: 0,
          total: 0,
        });
      }
      const s = bySubject.get(key);
      s.total++;
      if (a.status === "present") s.present++;
      else s.absent++;
    }
    const attendance = Array.from(bySubject.values()).map((s) => ({
      ...s,
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
    }));

    let totalLectures = 0,
      presentCount = 0;
    for (const a of data.attendance) {
      totalLectures++;
      if (a.status === "present") presentCount++;
    }
    const avgAttendance =
      totalLectures > 0 ? Math.round((presentCount / totalLectures) * 100) : 0;

    // Today's classes — filter the class's whole-week timetable down to today's day.
    const todayDayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
      new Date().getDay()
    ];
    const studentRoll =
      student.roll || student.rollNo || student.rollNumber || "";
    const timetableToday = data.timetable
      .filter(
        (t) =>
          t.type !== "Lab" ||
          rollInRange(studentRoll, t.labRollStart, t.labRollEnd),
      )
      .filter((t) => t.day === todayDayName)
      .sort(
        (a, b) =>
          timetableSortMinutes(a.startTime) - timetableSortMinutes(b.startTime),
      )
      .map((t) => ({
        time: timetableDisplayTime(t.startTime, t.endTime),
        subject: t.subjectName,
        room: t.room,
        type: t.type,
      }));

    // Pending marks — subjects this student has no mark record for yet.
    const markedSubjectIds = new Set(
      data.marks.map((m) => String(m.subject?._id || m.subject || "")),
    );
    const pendingMarks = data.subjects.filter(
      (s) => !markedSubjectIds.has(String(s._id)),
    ).length;

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
  }),
);

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const student = await currentStudent(req, res);
    if (!student) return;
    // Always re-sign the avatar so the browser gets a fresh pre-signed S3 URL
    // that won't 403/404. withFreshAvatar is a no-op for GridFS/public URLs.
    const mapped = await withFreshAvatar(mapStudent(student));
    ok(res, {
      success: true,
      student: mapped,
      profile: mapped,
    });
  }),
);

// POST /api/student/profile/photo — upload/replace the student's own photo.
// Deliberately student-only: a linked Parent account can VIEW this (it reads
// the same Student document via currentStudent()) but cannot change it.
// One image reference (Student.avatar) — HOD list/details, Admin, Super Admin,
// and the Parent portal all read it straight from this same document, so
// there's nothing else to update or keep in sync.
router.post(
  "/profile/photo",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "student")
      return fail(res, 403, "Only the student can update their own photo.");
    const student = await currentStudent(req, res);
    if (!student) return;
    let avatar;
    try {
      avatar = validateImageDataUri(
        req.body.image || req.body.avatar || req.body.photo,
      );
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }
    // Store avatar as base64 directly in MongoDB — bypasses S3 entirely.
    // Avatars are already compressed to ≤100 KB by the frontend, so inline
    // storage is fine. S3 requires GetObject permission to read back; storing
    // inline avoids that dependency and makes the photo work immediately.
    student.avatar = storeAvatarDataUri(avatar);
    student.updatedBy = req.user.id;
    await student.save();
    ok(
      res,
      { success: true, student: await withFreshAvatar(mapStudent(student)) },
      "Profile photo updated.",
    );
  }),
);

router.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const student = await currentStudent(req, res);
    if (!student) return;
    const data = await studentBundle(student);
    const bySubject = {};
    for (const a of data.attendance) {
      const key = String(
        a.subject?._id || a.subject || a.subjectName || "unknown",
      );
      const name = a.subject?.name || a.subjectName || "Unknown Subject";
      if (!bySubject[key])
        bySubject[key] = {
          name,
          present: 0,
          absent: 0,
          leave: 0,
          total: 0,
          records: [],
        };
      bySubject[key].total++;
      bySubject[key][a.status || "present"]++;
      bySubject[key].records.push({
        date: a.date,
        status: a.status,
        teacher: a.teacher,
        type: a.type,
        time: a.time,
        division: a.division,
        topic: a.topic || "",
        isProxy: !!a.isProxy,
        uploadedAt: a.createdAt,
      });
    }
    const subjects = Object.values(bySubject).map((s) => ({
      ...s,
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
    }));
    ok(res, {
      success: true,
      data: subjects,
      attendance: data.attendance,
      subjects,
      summary: subjects,
    });
  }),
);

// GET /api/student/attendance/pdf — download a personal attendance certificate as a real PDF.
// Available to both the student and any parent linked to them (route already allows both roles).
router.get(
  "/attendance/pdf",
  asyncHandler(async (req, res) => {
    const student = await currentStudent(req, res);
    if (!student) return;
    const data = await studentBundle(student);
    const bySubject = {};
    for (const a of data.attendance) {
      const key = String(
        a.subject?._id || a.subject || a.subjectName || "unknown",
      );
      const name = a.subject?.name || a.subjectName || "Unknown Subject";
      if (!bySubject[key])
        bySubject[key] = { name, present: 0, absent: 0, total: 0 };
      bySubject[key].total++;
      if (a.status === "present") bySubject[key].present++;
      else bySubject[key].absent++;
    }
    const rows = Object.values(bySubject).map((s) => ({
      name: s.name,
      total: s.total,
      present: s.present,
      absent: s.absent,
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
    }));

    streamSubjectAttendancePdf(res, {
      filename: `attendance-${student.roll || student._id}.pdf`,
      title: `Attendance Certificate — ${student.name}`,
      subtitle: [
        student.course,
        student.semester ? `Semester ${student.semester}` : null,
        `Roll No ${student.roll || student.rollNo || "-"}`,
      ]
        .filter(Boolean)
        .join(" · "),
      generatedBy: req.user.name,
      rows,
    });
  }),
);

router.get(
  "/subjects",
  asyncHandler(async (req, res) => {
    const student = await currentStudent(req, res);
    if (!student) return;
    ok(res, {
      success: true,
      subjects: (await studentBundle(student)).subjects,
    });
  }),
);

router.get(
  "/syllabus",
  asyncHandler(async (req, res) => {
    const student = await currentStudent(req, res);
    if (!student) return;
    const syllabus = (await studentBundle(student)).syllabus;
    ok(res, { success: true, data: syllabus, syllabus });
  }),
);

router.get(
  "/notices",
  asyncHandler(async (req, res) => {
    const student = await currentStudent(req, res);
    if (!student) return;
    ok(res, { success: true, notices: (await studentBundle(student)).notices });
  }),
);

router.get(
  "/marks",
  asyncHandler(async (req, res) => {
    const student = await currentStudent(req, res);
    if (!student) return;
    const marks = (await studentBundle(student)).marks;
    const bySubject = {};
    for (const m of marks) {
      const key = String(m.subject?._id || m.subject || m.subjectName);
      if (!bySubject[key]) {
        bySubject[key] = {
          subject: {
            _id: m.subject?._id,
            name: m.subject?.name || m.subjectName || "Unknown",
            code: m.subject?.code || "",
          },
          exams: [],
          totalObtained: 0,
          totalMax: 0,
        };
      }
      const hasNumericMark = typeof m.marks === "number";
      bySubject[key].exams.push({
        name: m.examType,
        examType: m.examType,
        marksObtained: m.marks,
        totalMarks: m.maxMarks,
        marks: m.marks,
        maxMarks: m.maxMarks,
        date: m.updatedAt,
        image: m.image || "",
        imageUploadedAt: m.imageUploadedAt || null,
        published: !!m.published,
        enteredBy: m.enteredBy || "teacher",
      });
      // Only a real teacher-entered number counts toward the subject total —
      // a screenshot-only row (no number yet) shouldn't skew the percentage.
      if (hasNumericMark) {
        bySubject[key].totalObtained += m.marks;
        bySubject[key].totalMax += m.maxMarks || 100;
      }
    }
    ok(res, {
      success: true,
      data: Object.values(bySubject),
      marks,
      bySubject: Object.values(bySubject),
    });
  }),
);

// POST /api/student/marks/upload-image — a student self-reports a subject's
// marks by uploading a screenshot of their own marksheet, instead of (or
// alongside) a number the teacher/CC types in. This is always allowed —
// it's the student's own submission — and is always visible to that
// student immediately (see the `published` filter in studentBundle(),
// controllers/common.js), even before any teacher/CC has "sent" marks.
// Body: { subjectId, examType, image: "data:image/...;base64,..." }
router.post(
  "/marks/upload-image",
  asyncHandler(async (req, res) => {
    const student = await currentStudent(req, res);
    if (!student) return;
    if (req.user.role !== "student")
      return fail(res, 403, "Only the student can upload their own marksheet.");

    const { subjectId, examType } = req.body;
    if (!subjectId || !examType)
      return fail(res, 400, "subjectId and examType are required.");

    let image;
    try {
      image = validateImageDataUri(req.body.image);
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }
    if (!image) return fail(res, 400, "An image is required.");

    const storedUrl = await storeDataUri(
      image,
      `mark-${student._id}-${subjectId}-${examType}`,
    );

    const mark = await Mark.findOneAndUpdate(
      {
        student: student._id,
        subject: subjectId,
        examType,
        college: student.college,
        department: student.department,
        isDeleted: false,
      },
      {
        $set: {
          image: storedUrl,
          imageUploadedAt: new Date(),
          enteredBy: "student",
          updatedBy: req.user.id,
        },
        $setOnInsert: {
          student: student._id,
          subject: subjectId,
          examType,
          college: student.college,
          department: student.department,
          createdBy: req.user.id,
        },
      },
      { upsert: true, new: true },
    ).populate("subject", "name code");

    ok(res, { success: true, mark }, "Marksheet uploaded.");
  }),
);

// ── TIMETABLE: reads from Schedule collection (same as HOD writes to) ──────
router.get(
  "/timetable",
  asyncHandler(async (req, res) => {
    const student = await currentStudent(req, res);
    if (!student) return;

    // Find schedule for student's college + department
    // If student has course + semester, filter by those too
    const filter = {
      college: student.college,
      department: student.department,
      isDeleted: false,
    };
    if (student.course) filter.course = student.course;
    if (student.semester || student.sem)
      filter.semester = student.semester || student.sem;

    const studentRoll =
      student.roll || student.rollNo || student.rollNumber || "";
    const docs = (await Schedule.find(filter).lean()).filter((slot) => {
      if (slot.type !== "Lab") return true;
      return rollInRange(studentRoll, slot.labRollStart, slot.labRollEnd);
    });

    // Group by day
    const timetable = groupByDay(docs);

    // Also return raw array
    ok(res, {
      success: true,
      timetable,
      data: timetable, // alias for old client code
      schedule: timetable,
      total: docs.length,
    });
  }),
);

export default router;

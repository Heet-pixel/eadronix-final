import { Router } from "express";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Subject from "../models/Subject.js";
import Department from "../models/Department.js";
import Course from "../models/Course.js";
import Notice from "../models/Notice.js";
import Attendance from "../models/Attendance.js";
import Mark from "../models/Mark.js";
import Schedule from "../models/Schedule.js";
import Syllabus from "../models/Syllabus.js";
import CoHodActivity from "../models/CoHodActivity.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fail, ok } from "../utils/respond.js";
import {
  hardDeleteCascade,
  hardDeleteManyCascade,
} from "../utils/hardDelete.js";
import { storeDataUri } from "../utils/gridfs.js";
import { refreshS3Url } from "../utils/s3Storage.js";
import {
  createStudent,
  ensureUser,
  ensureEmailAvailable,
  live,
  logCoHodActivity,
  mapStudent,
  mapTeacher,
  normalizeSubjectPayload,
  syncSubjectSchedule,
  resolveSubjectForSlot,
  timesOverlap,
  updateStudentAndSyncParent,
  validateMobileNumber,
  validateImageDataUri,
  findAttendanceTimeConflict,
  validatePdfDataUri,
  validateAttendanceDateIsNotInTheFuture,
  validateLectureDuration,
  isRollWithinRange,
} from "../controllers/common.js";
import {
  to12h,
  to24h,
  groupSchedule,
  groupByDay,
} from "../utils/scheduleUtils.js";
import {
  streamAttendanceReportPdf,
  streamMarksReportPdf,
} from "../utils/pdfReport.js";

const router = Router();
router.use(requireAuth, allowRoles("hod", "co_hod"));

// Re-sign the avatar field on a single mapped student object so the HOD
// portal always sees a valid pre-signed S3 URL instead of a stale/expired one.
async function withFreshAvatar(studentObj) {
  if (!studentObj) return studentObj;
  studentObj.avatar = await refreshS3Url(studentObj.avatar);
  return studentObj;
}
// Batch version for student list endpoints.
async function withFreshAvatars(studentList) {
  if (!Array.isArray(studentList)) return studentList;
  return Promise.all(studentList.map(withFreshAvatar));
}

const scope = (req) => ({
  college: req.user.college,
  department: req.user.department,
  ...live,
});

function normalizeLabRollRange(slot) {
  const type = slot.type || "Lecture";
  const labRollStart = String(
    slot.labRollStart || slot.labStartRoll || slot.rollStart || "",
  ).trim();
  const labRollEnd = String(
    slot.labRollEnd || slot.labEndRoll || slot.rollEnd || "",
  ).trim();
  if (type !== "Lab") return { labRollStart: "", labRollEnd: "" };
  if (!labRollStart || !labRollEnd) {
    const err = new Error(
      "Lab slots require starting and ending student roll numbers.",
    );
    err.status = 400;
    throw err;
  }
  return { labRollStart, labRollEnd };
}

function rollRangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  const values = [aStart, aEnd, bStart, bEnd].map((v) => String(v).trim());
  if (values.every((v) => /^\d+$/.test(v))) {
    const [as, ae, bs, be] = values.map((v) => BigInt(v));
    const aLow = as < ae ? as : ae;
    const aHigh = as < ae ? ae : as;
    const bLow = bs < be ? bs : be;
    const bHigh = bs < be ? be : bs;
    return aLow <= bHigh && bLow <= aHigh;
  }
  const cmp = (x, y) => x.localeCompare(y, undefined, { numeric: true });
  const aLow = cmp(values[0], values[1]) <= 0 ? values[0] : values[1];
  const aHigh = aLow === values[0] ? values[1] : values[0];
  const bLow = cmp(values[2], values[3]) <= 0 ? values[2] : values[3];
  const bHigh = bLow === values[2] ? values[3] : values[2];
  return cmp(aLow, bHigh) <= 0 && cmp(bLow, aHigh) <= 0;
}

function scheduleSlotsConflict(a, b) {
  if (!timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime))
    return false;
  if (a.type === "Lab" && b.type === "Lab") {
    return rollRangesOverlap(
      a.labRollStart,
      a.labRollEnd,
      b.labRollStart,
      b.labRollEnd,
    );
  }
  return true;
}

function teacherSlotsConflict(a, b) {
  if (!timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime))
    return false;
  if (
    a.type === "Lab" &&
    b.type === "Lab" &&
    !rollRangesOverlap(
      a.labRollStart,
      a.labRollEnd,
      b.labRollStart,
      b.labRollEnd,
    )
  ) {
    return false;
  }
  return true;
}

function isGeneralScheduleSlot(slot) {
  return ["Break", "Library"].includes(slot.type || slot.subjectName);
}

async function ensureLabRollsExist({
  college,
  department,
  course,
  semester,
  labRollStart,
  labRollEnd,
}) {
  if (!labRollStart && !labRollEnd) return;
  const docs = await Student.find({
    college,
    department,
    isDeleted: false,
    status: { $ne: "Removed" },
    $or: [{ course }, { courseName: course }],
    $and: [
      { $or: [{ semester: Number(semester) }, { sem: Number(semester) }] },
    ],
  })
    .select("roll rollNo rollNumber")
    .lean();
  const rolls = new Set(
    docs.flatMap((s) =>
      [s.roll, s.rollNo, s.rollNumber]
        .filter(Boolean)
        .map((v) => String(v).trim()),
    ),
  );
  if (
    !rolls.has(String(labRollStart).trim()) ||
    !rolls.has(String(labRollEnd).trim())
  ) {
    const err = new Error(
      "Lab start and end roll numbers must be selected from existing students in this course and semester.",
    );
    err.status = 400;
    throw err;
  }
}

async function buildHodProfile(user) {
  const [studentCourses, teacherCourses, courseDocs, departmentDoc] =
    await Promise.all([
      Student.distinct("course", {
        college: user.college,
        department: user.department,
        isDeleted: false,
      }),
      User.distinct("course", {
        college: user.college,
        department: user.department,
        role: { $in: ["teacher", "hod", "co_hod"] },
        isDeleted: false,
      }),
      Course.find({
        college: user.college,
        department: user.department,
        isDeleted: false,
      })
        .select("name totalSems")
        .lean(),
      Department.findById(user.department).select("name").lean(),
    ]);
  const courses = [
    ...new Set(
      [
        ...courseDocs.map((c) => c.name),
        ...studentCourses,
        ...teacherCourses,
      ].filter(Boolean),
    ),
  ].sort();
  const subjects = await Subject.find({
    college: user.college,
    department: user.department,
    ...live,
  }).lean();
  const subjectsMap = {};
  for (const s of subjects) {
    if (!s.course) continue; // legacy subject with no real course — nothing to group it under
    const course = s.course;
    const sem = String(s.semester || s.sem || 1);
    if (!subjectsMap[course]) subjectsMap[course] = {};
    if (!subjectsMap[course][sem]) subjectsMap[course][sem] = [];
    subjectsMap[course][sem].push({
      id: s._id,
      _id: s._id,
      name: s.name,
      code: s.code,
    });
  }
  const finalCourses = courses;
  const semesterCount = Math.max(
    6,
    ...courseDocs.map((c) => Number(c.totalSems) || 0),
  );
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    avatar: user.avatar || "",
    emergencyContact: user.emergencyContact || "",
    college: user.college,
    departmentId: user.department,
    department: departmentDoc?.name || "Department",
    // Always derive from role rather than the stored `designation` string —
    // existing accounts appointed before this rename still have "HOD"/
    // "Co-HOD" saved in the DB; deriving from role keeps the display
    // consistent without needing a data migration.
    designation: user.role === "co_hod" ? "Co-Dept Admin" : "Dept Admin",
    courses: finalCourses,
    semesterCount,
    subjects: subjectsMap,
  };
}

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const profile = await buildHodProfile(req.user);
    ok(res, { ...profile, hod: profile, user: profile });
  }),
);

// Spec item 3: HOD's own profile is VIEW-ONLY — only the photo can be
// changed here. Personal/contact details are edited by Admin/Super Admin
// instead (see admin.routes.js PUT /hod/:id — actually blocked there too,
// per spec only Super Admin may edit; see super.routes.js PUT /staff/:id).
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
    req.user.avatar = await storeDataUri(avatar, `hod-${req.user.id}-avatar`);
    req.user.updatedBy = req.user.id;
    await req.user.save();
    const profile = await buildHodProfile(req.user);
    ok(
      res,
      { success: true, ...profile, hod: profile, user: profile },
      "Profile photo updated.",
    );
  }),
);

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const s = scope(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [students, teachers, subjects, announcements, presentToday] =
      await Promise.all([
        Student.countDocuments(s),
        User.countDocuments({
          ...s,
          role: { $in: ["teacher", "hod", "co_hod"] },
        }),
        Subject.countDocuments(s),
        Notice.countDocuments({
          college: req.user.college,
          $or: [
            { department: req.user.department },
            { department: null },
            { department: { $exists: false } },
          ],
          ...live,
        }),
        Attendance.countDocuments({
          ...s,
          status: "present",
          date: { $gte: today },
        }),
      ]);
    ok(res, { students, teachers, subjects, announcements, presentToday });
  }),
);

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const s = scope(req);
    const [students, teachers, subjects, announcements] = await Promise.all([
      Student.countDocuments(s),
      User.countDocuments({
        ...s,
        role: { $in: ["teacher", "hod", "co_hod"] },
      }),
      Subject.countDocuments(s),
      Notice.countDocuments({
        college: req.user.college,
        $or: [{ department: req.user.department }, { department: null }],
        ...live,
      }),
    ]);
    ok(res, { students, teachers, subjects, announcements });
  }),
);

// ── Students ──────────────────────────────────────────────────────────────
router.get(
  "/students",
  asyncHandler(async (req, res) => {
    const filter = { ...scope(req) };
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
    // "Removed" students (spec: a reversible soft off-boarding, separate from
    // hard delete) are hidden from the normal course/semester tabs by default
    // — they only show up when explicitly asking for the Removed section.
    filter.status =
      req.query.status === "Removed" ? "Removed" : { $ne: "Removed" };
    ok(res, {
      students: await withFreshAvatars(
        (await Student.find(filter).sort({ course: 1, sem: 1, name: 1 })).map(
          mapStudent,
        ),
      ),
    });
  }),
);
// Spec: HOD's Add Student form makes the STUDENT'S email compulsory (it
// becomes their own login) and the parent email optional — unlike the
// default createStudent() behaviour, which historically required a parent
// email. Bulk import (below) still requires neither, unchanged.
router.post(
  "/students",
  asyncHandler(async (req, res) => {
    ok(
      res,
      {
        student: await withFreshAvatar(
          mapStudent(
            await createStudent(req.body, req.user, {
              requireParentEmail: false,
              requireStudentEmail: true,
            }),
          ),
        ),
      },
      "Student saved.",
    );
  }),
);
router.put(
  "/students/:id",
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    if (body.mobile && !body.phone) body.phone = body.mobile;
    if (body.phone && !body.mobile) body.mobile = body.phone;
    if (body.rollNumber && !body.roll) body.roll = body.rollNumber;
    if (body.roll && !body.rollNumber) body.rollNumber = body.roll;
    if (body.roll && !body.rollNo) body.rollNo = body.roll;
    if (body.courseName && !body.course) body.course = body.courseName;
    if (body.course && !body.courseName) body.courseName = body.course;
    if (body.sem && !body.semester) body.semester = Number(body.sem);
    if (body.semester && !body.sem) body.sem = Number(body.semester);
    let student;
    try {
      student = await updateStudentAndSyncParent(
        {
          _id: req.params.id,
          college: req.user.college,
          department: req.user.department,
        },
        body,
        req.user.id,
      );
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }
    if (!student) return fail(res, 404, "Student not found.");
    ok(
      res,
      { student: await withFreshAvatar(mapStudent(student)) },
      "Student updated.",
    );
  }),
);
// DELETE = permanent. The record is actually removed from the database,
// unlike everywhere else in this app which soft-deletes. This is
// deliberate, explicit, irreversible — see POST /students/remove below for
// the reversible alternative ("Removed" section, recoverable).
router.delete(
  "/students/:id",
  asyncHandler(async (req, res) => {
    const student = await Student.findOne({
      _id: req.params.id,
      college: req.user.college,
      department: req.user.department,
    });
    if (!student) return fail(res, 404, "Student not found.");
    await hardDeleteCascade(student, req.user);
    ok(res, {}, "Student permanently deleted.");
  }),
);

// POST /api/hod/students/remove — reversible "soft off-boarding": student
// keeps every field (course, semester, attendance history, marks — nothing
// is touched) but is tagged status:'Removed' so it drops out of the normal
// course/semester tabs and appears only in the "Removed" section, ready to
// be brought straight back with their original course+semester intact.
router.post(
  "/students/remove",
  asyncHandler(async (req, res) => {
    const ids = req.body.ids || [];
    if (!ids.length) return fail(res, 400, "No student IDs provided.");
    await Student.updateMany(
      {
        _id: { $in: ids },
        college: req.user.college,
        department: req.user.department,
      },
      { $set: { status: "Removed", updatedBy: req.user.id } },
    );
    ok(res, { ids }, `${ids.length} student(s) moved to Removed.`);
  }),
);

// POST /api/hod/students/recover — brings removed students back to Active,
// straight into whatever course+semester they already had stored (never
// touched while removed), so they land back exactly where they left off.
router.post(
  "/students/recover",
  asyncHandler(async (req, res) => {
    const ids = req.body.ids || [];
    if (!ids.length) return fail(res, 400, "No student IDs provided.");
    await Student.updateMany(
      {
        _id: { $in: ids },
        college: req.user.college,
        department: req.user.department,
        status: "Removed",
      },
      { $set: { status: "Active", updatedBy: req.user.id } },
    );
    ok(res, { ids }, `${ids.length} student(s) recovered.`);
  }),
);

// POST /api/hod/students/promote — bulk-advance students to the next semester
// Body: { course, semester, studentIds? }
//   - course + semester (current) are required: identifies the cohort being promoted.
//   - studentIds optional: if omitted, promotes every active student in that course+semester.
//   - If the course's totalSems is reached, students are marked status:'Graduated' instead of bumped.
// Historical Attendance/Mark documents are untouched — they keep the semester value
// that was current when the record was created, so past reports stay accurate.
router.post(
  "/students/promote",
  asyncHandler(async (req, res) => {
    const { course, semester, studentIds } = req.body;
    if (!course || !semester)
      return fail(res, 400, "Course and current semester are required.");
    const curSem = Number(semester);

    const courseDoc = await Course.findOne({
      ...scope(req),
      $or: [{ name: course }, { code: course }],
    });
    const totalSems = courseDoc?.totalSems || 6;

    const filter = {
      ...scope(req),
      $or: [{ course }, { courseName: course }],
      $and: [{ $or: [{ semester: curSem }, { sem: curSem }] }],
    };
    if (Array.isArray(studentIds) && studentIds.length)
      filter._id = { $in: studentIds };

    const students = await Student.find(filter);
    if (!students.length)
      return fail(
        res,
        404,
        "No matching students found for that course and semester.",
      );

    const isFinalSem = curSem >= totalSems;
    const update = isFinalSem
      ? { status: "Graduated", updatedBy: req.user.id }
      : { semester: curSem + 1, sem: curSem + 1, updatedBy: req.user.id };

    await Student.updateMany(
      { _id: { $in: students.map((s) => s._id) } },
      update,
    );

    ok(
      res,
      {
        promoted: students.length,
        action: isFinalSem ? "graduated" : "promoted",
        toSemester: isFinalSem ? null : curSem + 1,
        studentIds: students.map((s) => String(s._id)),
      },
      isFinalSem
        ? `${students.length} student(s) marked as graduated.`
        : `${students.length} student(s) promoted to semester ${curSem + 1}.`,
    );
  }),
);
router.delete(
  "/students",
  asyncHandler(async (req, res) => {
    const ids = req.body.ids || [];
    if (!ids.length) return fail(res, 400, "No student IDs provided.");
    const count = await hardDeleteManyCascade(
      Student,
      {
        _id: { $in: ids },
        college: req.user.college,
        department: req.user.department,
      },
      req.user,
    );
    ok(res, { ids }, `${count} student(s) permanently deleted.`);
  }),
);
router.post(
  "/import/students",
  asyncHandler(async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return fail(res, 400, "No student data provided.");
    const docs = [];
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        docs.push(
          await createStudent(
            {
              ...row,
              course: row.course || req.body.course,
              sem: row.sem || req.body.sem,
            },
            req.user,
            { requireParentEmail: false },
          ),
        );
      } catch (e) {
        errors.push({
          row: i + 1,
          name: row.name || "(no name)",
          message: e.message,
        });
      }
    }
    ok(
      res,
      { imported: docs.length, students: docs.map(mapStudent), errors },
      errors.length
        ? `${docs.length} imported, ${errors.length} failed — see details.`
        : `${docs.length} students imported.`,
    );
  }),
);

// ── Teachers ──────────────────────────────────────────────────────────────
router.get(
  "/teachers",
  asyncHandler(async (req, res) => {
    ok(res, {
      teachers: (
        await User.find({
          ...scope(req),
          role: { $in: ["teacher", "hod", "co_hod"] },
        })
      ).map(mapTeacher),
    });
  }),
);
router.get(
  "/teachers/:id/detail",
  asyncHandler(async (req, res) => {
    const teacher = await User.findOne({
      _id: req.params.id,
      college: req.user.college,
      department: req.user.department,
      role: { $in: ["teacher", "hod", "co_hod"] },
      ...live,
    }).lean();
    if (!teacher) return fail(res, 404, "Teacher not found.");

    const [schedule, attendance, syllabus] = await Promise.all([
      Schedule.find({ ...scope(req), teacher: teacher._id })
        .sort({ day: 1, startTime: 1 })
        .lean(),
      Attendance.find({ ...scope(req), teacher: teacher._id })
        .select(
          "date course semester subject subjectName division time type status topic isProxy",
        )
        .lean(),
      Syllabus.find({ ...scope(req), teacher: teacher._id })
        .populate("subject", "name code")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const sessions = new Map();
    for (const d of attendance) {
      const key = [
        d.course,
        d.semester,
        d.subject ? String(d.subject) : d.subjectName || "",
        d.division || "",
        d.time || "",
        dayKey(d.date),
      ].join("|");
      if (!sessions.has(key)) {
        sessions.set(key, {
          date: d.date,
          course: d.course,
          semester: d.semester,
          subjectName: d.subjectName,
          time: d.time,
          topic: d.topic || "",
          isProxy: !!d.isProxy,
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

    const sessionList = Array.from(sessions.values()).sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
    ok(res, {
      teacher: mapTeacher(teacher),
      metrics: {
        scheduled: schedule.length,
        taken: sessionList.length,
        syllabus: syllabus.length,
        attendanceMarked: attendance.length,
      },
      schedule,
      recentLectures: sessionList.slice(0, 8),
      syllabus,
    });
  }),
);
router.post(
  "/teachers",
  asyncHandler(async (req, res) => {
    if (!req.body.email) return fail(res, 400, "Email is required.");
    ok(
      res,
      {
        teacher: mapTeacher(
          await ensureUser(
            {
              ...req.body,
              role: "teacher",
              college: req.user.college,
              department: req.user.department,
            },
            req.user.id,
          ),
        ),
      },
      "Teacher saved.",
    );
  }),
);
router.put(
  "/teachers/:id",
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    if ("emergencyContact" in body) {
      const trimmedEmergencyContact = String(
        body.emergencyContact || "",
      ).trim();
      if (trimmedEmergencyContact) {
        try {
          body.emergencyContact = validateMobileNumber(body.emergencyContact);
        } catch (e) {
          return fail(res, e.status || 400, e.message);
        }
      } else {
        delete body.emergencyContact;
      }
    }
    if (body.email) {
      try {
        body.email = await ensureEmailAvailable(body.email, {
          excludeUserId: req.params.id,
        });
      } catch (e) {
        return fail(res, e.status || 400, e.message);
      }
    }
    const teacher = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        college: req.user.college,
        department: req.user.department,
      },
      { ...body, updatedBy: req.user.id },
      { new: true },
    );
    if (!teacher) return fail(res, 404, "Teacher not found.");
    ok(res, { teacher: mapTeacher(teacher) }, "Teacher updated.");
  }),
);
router.delete(
  "/teachers/:id",
  asyncHandler(async (req, res) => {
    const teacher = await User.findOne({
      _id: req.params.id,
      college: req.user.college,
      department: req.user.department,
    });
    if (!teacher) return fail(res, 404, "Teacher not found.");
    await hardDeleteCascade(teacher, req.user);
    ok(res, {}, "Teacher permanently deleted.");
  }),
);
router.delete(
  "/teachers",
  asyncHandler(async (req, res) => {
    const ids = req.body.ids || [];
    if (!ids.length) return fail(res, 400, "No teacher IDs provided.");
    const count = await hardDeleteManyCascade(
      User,
      {
        _id: { $in: ids },
        college: req.user.college,
        department: req.user.department,
      },
      req.user,
    );
    ok(res, { ids }, `${count} teacher(s) permanently deleted.`);
  }),
);
router.post(
  "/import/teachers",
  asyncHandler(async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const docs = [];
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        docs.push(
          await ensureUser(
            {
              ...row,
              email:
                row.email ||
                `t_${Date.now()}_${Math.random().toString(36).slice(2)}@sal.local`,
              role: "teacher",
              college: req.user.college,
              department: req.user.department,
            },
            req.user.id,
          ),
        );
      } catch (e) {
        errors.push({
          row: i + 1,
          name: row.name || "(no name)",
          message: e.message,
        });
      }
    }
    ok(
      res,
      { imported: docs.length, teachers: docs.map(mapTeacher), errors },
      errors.length
        ? `${docs.length} imported, ${errors.length} failed — see details.`
        : `${docs.length} teachers imported.`,
    );
  }),
);

// ── Subjects ──────────────────────────────────────────────────────────────
router.get(
  "/subjects",
  asyncHandler(async (req, res) => {
    const subjects = await Subject.find(scope(req))
      .populate("teacher", "name email")
      .lean();
    const subjectsMap = {};
    for (const s of subjects) {
      if (!s.course) continue;
      const course = s.course;
      const sem = String(s.semester || s.sem || 1);
      if (!subjectsMap[course]) subjectsMap[course] = {};
      if (!subjectsMap[course][sem]) subjectsMap[course][sem] = [];
      subjectsMap[course][sem].push({
        id: s._id,
        _id: s._id,
        name: s.name,
        code: s.code,
      });
    }
    ok(res, { subjects: subjectsMap, subjectsList: subjects });
  }),
);
// Subjects: HOD/Co-HOD now manage their OWN department's subject list
// directly (this used to be Admin-only). Admin keeps a read-only aggregated
// view across all departments/courses/semesters — see admin.routes.js.
router.post(
  "/subjects",
  asyncHandler(async (req, res) => {
    if (!req.body.name) return fail(res, 400, "Subject name is required.");
    // Force the department to the HOD/Co-HOD's own — never let the client
    // pick a different department to add a subject into.
    const body = await normalizeSubjectPayload(
      { ...req.body, departmentId: req.user.department },
      req.user,
    );
    const dup = await Subject.findOne({
      college: req.user.college,
      department: body.department,
      course: body.course,
      semester: body.semester,
      ...live,
      name: new RegExp(
        `^${String(body.name)
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i",
      ),
    })
      .select("_id")
      .lean();
    if (dup)
      return fail(
        res,
        409,
        `"${body.name}" already exists for this course/semester.`,
      );
    const subject = await Subject.create({
      ...body,
      college: req.user.college,
      createdBy: req.user.id,
    });
    await syncSubjectSchedule(subject, req.user);
    await logCoHodActivity(
      req.user,
      `Added subject "${subject.name}" to ${subject.course} · Sem ${subject.semester}`,
    );
    ok(res, { subject }, "Subject added.");
  }),
);
router.put(
  "/subjects/:id",
  asyncHandler(async (req, res) => {
    const existing = await Subject.findOne({
      _id: req.params.id,
      college: req.user.college,
      department: req.user.department,
    });
    if (!existing)
      return fail(res, 404, "Subject not found in your department.");
    const body = await normalizeSubjectPayload(
      {
        course: existing.course,
        semester: existing.semester,
        ...req.body,
        departmentId: req.user.department,
      },
      req.user,
    );
    const subject = await Subject.findOneAndUpdate(
      {
        _id: req.params.id,
        college: req.user.college,
        department: req.user.department,
      },
      { ...body, updatedBy: req.user.id },
      { new: true },
    );
    if (subject) await syncSubjectSchedule(subject, req.user);
    if (!subject) return fail(res, 404, "Subject not found.");
    await logCoHodActivity(
      req.user,
      `Updated subject "${subject.name}" (${subject.course} · Sem ${subject.semester})`,
    );
    ok(res, { subject }, "Subject updated.");
  }),
);
router.delete(
  "/subjects/:id",
  asyncHandler(async (req, res) => {
    const subject = await Subject.findOne({
      _id: req.params.id,
      college: req.user.college,
      department: req.user.department,
    });
    if (!subject)
      return fail(res, 404, "Subject not found in your department.");
    const { name, course, semester } = subject;
    await hardDeleteCascade(subject, req.user);
    await logCoHodActivity(
      req.user,
      `Removed subject "${name}" (${course} · Sem ${semester})`,
    );
    ok(res, {}, "Subject permanently deleted.");
  }),
);

// ── Attendance ────────────────────────────────────────────────────────────
router.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const filter = { ...scope(req) };
    if (req.query.studentId) filter.student = req.query.studentId;
    if (req.query.date) {
      const d = new Date(req.query.date);
      filter.date = { $gte: d, $lte: new Date(d.getTime() + 86399999) };
    }
    ok(res, {
      attendance: await Attendance.find(filter)
        .populate("student", "name roll")
        .populate("subject", "name code")
        .populate("teacher", "name")
        .sort({ date: -1 })
        .limit(1000),
    });
  }),
);
router.get(
  "/attendance-report",
  asyncHandler(async (req, res) => {
    const filter = scope(req);
    if (req.query.course) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    const attendance = await Attendance.find(filter)
      .populate("student", "name roll course sem semester")
      .populate("subject", "name code")
      .populate("teacher", "name");
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
    ok(res, { attendance, summary: summaryArr });
  }),
);

// GET /api/hod/marks-report — per-student, per-subject marks summary (mirrors attendance-report).
// Mark documents don't carry course/semester themselves, so the cohort filter is applied
// against the linked Student, then marks for the matching students are pulled and grouped.
router.get(
  "/marks-report",
  asyncHandler(async (req, res) => {
    const studentFilter = { ...scope(req) };
    if (req.query.course)
      studentFilter.$or = [
        { course: req.query.course },
        { courseName: req.query.course },
      ];
    if (req.query.semester)
      studentFilter.$and = [
        {
          $or: [
            { semester: Number(req.query.semester) },
            { sem: Number(req.query.semester) },
          ],
        },
      ];
    const students = await Student.find(studentFilter).select(
      "_id name roll course sem semester",
    );
    const studentIds = students.map((s) => s._id);
    const studentMap = Object.fromEntries(
      students.map((s) => [String(s._id), s]),
    );

    const markFilter = {
      college: req.user.college,
      department: req.user.department,
      ...live,
      student: { $in: studentIds },
    };
    if (req.query.examType) markFilter.examType = req.query.examType;
    const marks = await Mark.find(markFilter).populate("subject", "name code");

    const summary = {};
    for (const m of marks) {
      const sid = String(m.student);
      if (!summary[sid])
        summary[sid] = {
          student: studentMap[sid],
          subjects: {},
          totalMarks: 0,
          totalMax: 0,
        };
      const sk = String(m.subject?._id || m.subject || m.subjectName || "x");
      if (!summary[sid].subjects[sk])
        summary[sid].subjects[sk] = {
          name: m.subject?.name || m.subjectName || "Unknown",
          entries: [],
        };
      summary[sid].subjects[sk].entries.push({
        examType: m.examType,
        marks: m.marks,
        maxMarks: m.maxMarks || 100,
      });
      summary[sid].totalMarks += Number(m.marks) || 0;
      summary[sid].totalMax += Number(m.maxMarks) || 100;
    }
    const summaryArr = Object.values(summary).map((s) => ({
      ...s,
      subjects: Object.values(s.subjects),
      percentage:
        s.totalMax > 0 ? Math.round((s.totalMarks / s.totalMax) * 100) : 0,
    }));
    ok(res, { marks, summary: summaryArr });
  }),
);

// GET /api/hod/attendance-report/pdf — same data as /attendance-report, rendered as a real PDF.
router.get(
  "/attendance-report/pdf",
  asyncHandler(async (req, res) => {
    const filter = scope(req);
    if (req.query.course) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    const attendance = await Attendance.find(filter).populate(
      "student",
      "name roll course sem semester",
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
      title: "Attendance Report",
      subtitle:
        [
          req.query.course,
          req.query.semester ? `Semester ${req.query.semester}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "All courses & semesters",
      generatedBy: req.user.name,
      rows,
    });
  }),
);

// GET /api/hod/marks-report/pdf — same data as /marks-report, rendered as a real PDF.
router.get(
  "/marks-report/pdf",
  asyncHandler(async (req, res) => {
    const studentFilter = { ...scope(req) };
    if (req.query.course)
      studentFilter.$or = [
        { course: req.query.course },
        { courseName: req.query.course },
      ];
    if (req.query.semester)
      studentFilter.$and = [
        {
          $or: [
            { semester: Number(req.query.semester) },
            { sem: Number(req.query.semester) },
          ],
        },
      ];
    const students = await Student.find(studentFilter).select("_id name roll");
    const studentIds = students.map((s) => s._id);
    const studentMap = Object.fromEntries(
      students.map((s) => [String(s._id), s]),
    );

    const markFilter = {
      college: req.user.college,
      department: req.user.department,
      ...live,
      student: { $in: studentIds },
    };
    if (req.query.examType) markFilter.examType = req.query.examType;
    const marks = await Mark.find(markFilter);

    const totals = {};
    for (const m of marks) {
      const sid = String(m.student);
      if (!totals[sid]) totals[sid] = { totalMarks: 0, totalMax: 0 };
      totals[sid].totalMarks += Number(m.marks) || 0;
      totals[sid].totalMax += Number(m.maxMarks) || 100;
    }
    const rows = Object.entries(totals)
      .map(([sid, t]) => ({
        name: studentMap[sid]?.name || "Unknown",
        roll: studentMap[sid]?.roll || studentMap[sid]?.rollNo || "-",
        totalMarks: t.totalMarks,
        totalMax: t.totalMax,
        percentage:
          t.totalMax > 0 ? Math.round((t.totalMarks / t.totalMax) * 100) : 0,
      }))
      .sort((a, b) =>
        a.roll.localeCompare(b.roll, undefined, { numeric: true }),
      );

    streamMarksReportPdf(res, {
      title: "Marks Report",
      subtitle:
        [
          req.query.course,
          req.query.semester ? `Semester ${req.query.semester}` : null,
          req.query.examType,
        ]
          .filter(Boolean)
          .join(" · ") || "All courses & semesters",
      generatedBy: req.user.name,
      rows,
    });
  }),
);
// Spec item 4: HOD marking attendance must work identically to a Teacher
// doing so — same subject-lock, same duplicate-submission guard, same
// cross-teacher time-overlap guard. Mirrors teacher.routes.js POST /attendance.
router.post(
  "/attendance",
  asyncHandler(async (req, res) => {
    const rawRecords = req.body.records || req.body.attendance || [];
    const course = req.body.course || "";
    const semester =
      Number(req.body.semester || req.body.sem || 0) || undefined;
    const records = Array.isArray(rawRecords)
      ? rawRecords
      : Object.entries(rawRecords).map(([studentId, status]) => ({
          student: studentId,
          studentId,
          status,
        }));

    if (!records.length)
      return fail(res, 400, "Attendance records are required.");
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

    const normalizeStatus = (status) => {
      const value = String(status || "").toLowerCase();
      if (value === "p" || value === "present") return "present";
      if (value === "l" || value === "leave" || value === "late")
        return "leave";
      return "absent";
    };

    const sessionDate = req.body.date ? new Date(req.body.date) : new Date();
    const division = req.body.division || "";
    const type = req.body.type || subjectDoc.type || "Lecture";
    const time = req.body.time || "";
    const topic = String(req.body.topic || "").trim();
    const isProxy = Boolean(req.body.isProxy);

    // Practical/Lab roll-number batching (mirrors teacher.routes.js POST
    // /attendance): an HOD marking a Practical can scope the lecture to
    // just one roll-number range (e.g. 1-21) instead of the whole class,
    // so several teachers/HODs can mark different lab batches of the same
    // class at the same time slot. Theory/Tutorial/Seminar (or a Practical
    // explicitly marked "All Students") always cover the whole class.
    const isPractical = String(type).trim().toLowerCase() === "practical";
    let rollRangeStart = String(
      req.body.rollRangeStart || req.body.rollStart || "",
    ).trim();
    let rollRangeEnd = String(
      req.body.rollRangeEnd || req.body.rollEnd || "",
    ).trim();
    let allStudents =
      req.body.allStudents !== undefined ? Boolean(req.body.allStudents) : true;
    if (!isPractical) {
      rollRangeStart = "";
      rollRangeEnd = "";
      allStudents = true;
    } else if (allStudents) {
      rollRangeStart = "";
      rollRangeEnd = "";
    } else {
      if (!rollRangeStart || !rollRangeEnd) {
        return fail(
          res,
          400,
          'Select both a Start and End roll number for this practical, or choose "All Students".',
        );
      }
      // Keep the stored range ascending regardless of the order picked in.
      if (
        /^\d+$/.test(rollRangeStart) &&
        /^\d+$/.test(rollRangeEnd) &&
        Number(rollRangeStart) > Number(rollRangeEnd)
      ) {
        [rollRangeStart, rollRangeEnd] = [rollRangeEnd, rollRangeStart];
      }
      // Defense in depth: confirm every student in this submission actually
      // falls inside the chosen roll range, even though the UI already
      // filters the grid to it.
      const submittedIds = records
        .map((r) => r.student || r.studentId)
        .filter(Boolean);
      if (submittedIds.length) {
        const submittedStudents = await Student.find({
          _id: { $in: submittedIds },
        })
          .select("roll rollNo rollNumber")
          .lean();
        const outOfRange = submittedStudents.some(
          (st) =>
            !isRollWithinRange(
              st.roll || st.rollNo || st.rollNumber || "",
              rollRangeStart,
              rollRangeEnd,
            ),
        );
        if (outOfRange) {
          return fail(
            res,
            400,
            `One or more selected students fall outside roll ${rollRangeStart}-${rollRangeEnd}.`,
          );
        }
      }
    }

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

    const dayStart = new Date(sessionDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(sessionDate);
    dayEnd.setHours(23, 59, 59, 999);
    const alreadyExists = await Attendance.findOne({
      teacher: req.user.id,
      ...live,
      course,
      semester,
      subject: subjectDoc._id,
      division,
      time,
      rollRangeStart,
      rollRangeEnd,
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

    const timeConflict = await findAttendanceTimeConflict({
      college: req.user.college,
      department: req.user.department,
      course,
      semester,
      division,
      date: sessionDate,
      startTime: attendanceStartTime || "",
      endTime: attendanceEndTime || "",
      excludeTeacher: req.user.id,
      rollRangeStart,
      rollRangeEnd,
      allStudents,
    });
    if (timeConflict) return fail(res, 409, timeConflict.message);

    const docs = await Attendance.insertMany(
      records.map((r) => ({
        student: r.student || r.studentId,
        status: normalizeStatus(r.status),
        course,
        semester,
        subject: subjectDoc._id,
        subjectName: subjectDoc.name,
        division,
        type,
        time,
        topic,
        allStudents,
        rollRangeStart,
        rollRangeEnd,
        isProxy,
        proxyForSubject: isProxy ? subjectDoc._id : undefined,
        proxyForSubjectName: isProxy ? subjectDoc.name : "",
        college: req.user.college,
        department: req.user.department,
        teacher: req.user.id,
        date: sessionDate,
      })),
    );
    ok(res, { saved: docs.length }, `${docs.length} attendance records saved.`);
  }),
);

// ── Attendance History (spec item 4 & 5) — HOD sees EVERY teacher's lectures
// in the department (unlike a Teacher, who only ever sees their own — see
// teacher.routes.js), and can edit any of them. Mirrors the same
// session-key approach as the Teacher's Attendance History for consistency.
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

router.get(
  "/attendance/history",
  asyncHandler(async (req, res) => {
    const filter = { ...scope(req) };
    if (req.query.course) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    if (req.query.teacher) filter.teacher = req.query.teacher;
    const docs = await Attendance.find(filter)
      .populate("teacher", "name")
      .select(
        "date course semester subject subjectName division time type status topic isProxy teacher allStudents rollRangeStart rollRangeEnd",
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
        teacher: d.teacher ? String(d.teacher._id || d.teacher) : null,
        rollRangeStart: d.rollRangeStart || "",
        rollRangeEnd: d.rollRangeEnd || "",
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
          allStudents: d.allStudents !== false,
          rollRangeStart: d.rollRangeStart || "",
          rollRangeEnd: d.rollRangeEnd || "",
          teacherName: d.teacher?.name || "Unknown",
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

router.get(
  "/attendance/session/:sessionKey",
  asyncHandler(async (req, res) => {
    const parts = decodeSessionKey(req.params.sessionKey);
    if (!parts) return fail(res, 400, "Invalid session reference.");
    const candidates = await Attendance.find({
      ...scope(req),
      course: parts.course,
      semester: parts.semester,
    })
      .populate("student", "name roll rollNo")
      .populate("teacher", "name")
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
          teacher: d.teacher ? String(d.teacher._id || d.teacher) : null,
          rollRangeStart: d.rollRangeStart || "",
          rollRangeEnd: d.rollRangeEnd || "",
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
        allStudents: records[0].allStudents !== false,
        rollRangeStart: records[0].rollRangeStart || "",
        rollRangeEnd: records[0].rollRangeEnd || "",
        date: records[0].date,
        uploadedAt: records[0].createdAt,
        teacherName: records[0].teacher?.name || "Unknown",
      },
      records: records.map((r) => ({
        id: r._id,
        student: r.student,
        status: r.status,
      })),
    });
  }),
);

router.put(
  "/attendance/session/:sessionKey",
  asyncHandler(async (req, res) => {
    const parts = decodeSessionKey(req.params.sessionKey);
    if (!parts) return fail(res, 400, "Invalid session reference.");
    const records = req.body.records || [];
    if (!Array.isArray(records) || !records.length)
      return fail(res, 400, "No records to update.");

    const candidates = await Attendance.find({
      ...scope(req),
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
          teacher: d.teacher ? String(d.teacher) : null,
          rollRangeStart: d.rollRangeStart || "",
          rollRangeEnd: d.rollRangeEnd || "",
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

// ── Marks ─────────────────────────────────────────────────────────────────
router.get(
  "/marks",
  asyncHandler(async (req, res) => {
    const filter = scope(req);
    if (req.query.studentId) filter.student = req.query.studentId;
    // NOTE: previously accepted but silently ignored ?examType — the
    // frontend (hod/js/marks.js fetchExistingMarks) already sends this and
    // was filtering client-side, but applying it here too cuts payload size
    // for departments with a lot of exam history.
    if (req.query.examType) filter.examType = req.query.examType;
    ok(res, {
      marks: await Mark.find(filter)
        .populate("student", "name roll")
        .populate("subject", "name code"),
    });
  }),
);

// PATCH /api/hod/marks/publish — HOD's own "send marks to students" control.
// Unlike the teacher/CC version (scoped to their own subject or their CC
// semester), the HOD can publish/unpublish ANY exam sheet in their
// department — useful for a Class-Coordinator-created sheet the HOD wants
// to release (or pull back) on the CC's behalf.
router.patch(
  "/marks/publish",
  asyncHandler(async (req, res) => {
    const { course, examType, subjectIds } = req.body;
    const semester = Number(req.body.semester);
    const publish = req.body.publish !== false;
    if (!course || !semester || !examType)
      return fail(res, 400, "course, semester and examType are required.");

    const subjectFilter = { ...scope(req), course, semester };
    const subjects = await Subject.find(subjectFilter).select("_id").lean();
    let subjectIdList = subjects.map((s) => String(s._id));
    if (Array.isArray(subjectIds) && subjectIds.length) {
      subjectIdList = subjectIdList.filter((id) => subjectIds.includes(id));
    }
    if (!subjectIdList.length)
      return fail(res, 404, "No subjects found for this course/semester.");

    const result = await Mark.updateMany(
      { ...scope(req), subject: { $in: subjectIdList }, examType },
      {
        $set: publish
          ? {
              published: true,
              publishedAt: new Date(),
              publishedBy: req.user.id,
            }
          : { published: false },
      },
    );
    ok(
      res,
      {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        published: publish,
      },
      publish
        ? `Marks sent to ${result.modifiedCount} student record(s).`
        : `Marks withdrawn from ${result.modifiedCount} student record(s).`,
    );
  }),
);
router.post(
  "/marks",
  asyncHandler(async (req, res) => {
    // Support both single mark and array of marks
    const records = Array.isArray(req.body)
      ? req.body
      : req.body.records || [req.body];
    const docs = await Mark.insertMany(
      records.map((r) => ({
        ...r,
        college: req.user.college,
        department: req.user.department,
        createdBy: req.user.id,
      })),
      { ordered: false },
    );
    ok(res, { marks: docs, mark: docs[0] }, "Marks saved.");
  }),
);
// POST /api/hod/marks/bulk-upsert — save a whole marks sheet without creating duplicates.
// Each record is matched on (student, subject, examType); if a Mark already exists it's
// updated in place, otherwise a new one is created. Use this for sheet/grid entry instead
// of POST /marks (which always inserts and would duplicate rows on re-save).
router.post(
  "/marks/bulk-upsert",
  asyncHandler(async (req, res) => {
    const records = Array.isArray(req.body) ? req.body : req.body.records || [];
    if (!records.length)
      return fail(res, 400, "At least one mark record is required.");
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
      { marks: saved, saved: saved.length },
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
      },
      { ...req.body, updatedBy: req.user.id },
      { new: true },
    );
    if (!mark) return fail(res, 404, "Mark not found.");
    ok(res, { mark }, "Marks updated.");
  }),
);
router.delete(
  "/marks/:id",
  asyncHandler(async (req, res) => {
    const mark = await Mark.findOne({
      _id: req.params.id,
      college: req.user.college,
      department: req.user.department,
    });
    if (!mark) return fail(res, 404, "Mark not found.");
    await hardDeleteCascade(mark, req.user);
    ok(res, {}, "Mark permanently deleted.");
  }),
);

// ── SCHEDULE (full CRUD — syncs to teacher & student) ──────────────────────
// GET /api/hod/schedule → grouped by { course: { sem: { day: [slots] } } }
router.get(
  "/schedule",
  asyncHandler(async (req, res) => {
    const filter = { ...scope(req) };
    if (req.query.course) filter.course = req.query.course;
    if (req.query.semester) filter.semester = Number(req.query.semester);
    if (req.query.teacher) filter.teacher = req.query.teacher;
    const docs = await Schedule.find(filter).populate("teacher", "name").lean();
    ok(res, { schedule: groupSchedule(docs), docs });
  }),
);

// POST /api/hod/schedule — bulk replace for a course+sem (from HOD edit panel)
// Body: { course, semester, slots: [ { day, startTime, endTime, subjectId|subjectName, teacher, room, type } ] }
//
// Enforces spec items 5 & 6:
//   5. Every slot's subject must resolve against the Admin-created master Subject
//      list (resolveSubjectForSlot throws otherwise — no free-typed subjects).
//   6. No slot may overlap another lecture for the same class, and no teacher may
//      be double-booked across overlapping times on the same day. The WHOLE batch
//      is rejected (nothing is saved) if any slot conflicts, so the HOD gets one
//      clear error instead of a half-saved timetable.
router.post(
  "/schedule",
  asyncHandler(async (req, res) => {
    const { course, semester, slots } = req.body;
    if (!course || !semester)
      return fail(res, 400, "course and semester are required.");
    if (!Array.isArray(slots)) return fail(res, 400, "slots must be an array.");

    const semesterNum = Number(semester);
    const usableSlots = slots.filter(
      (s) =>
        s.day && (s.subjectId || s.subjectName || isGeneralScheduleSlot(s)),
    );

    // Resolve every slot's subject against the master list and its teacher, and
    // check for conflicts BEFORE deleting/writing anything — validate first, save second.
    const resolved = [];
    const inBatchAccepted = []; // conflict-check accumulator for slots within this same save
    for (const s of usableSlots) {
      const isGeneral = isGeneralScheduleSlot(s);
      let subject = null;
      if (!isGeneral) {
        try {
          subject = await resolveSubjectForSlot({
            college: req.user.college,
            department: req.user.department,
            course,
            semester: semesterNum,
            subjectId: s.subjectId,
            subjectName: s.subjectName,
          });
        } catch (e) {
          return fail(res, e.status || 400, e.message);
        }
      }

      const startTime =
        s.startTime || to24h((s.time || "").split("–")[0].trim());
      const endTime =
        s.endTime || to24h(((s.time || "").split("–")[1] || "").trim());

      let labRange;
      try {
        labRange = normalizeLabRollRange(s);
        await ensureLabRollsExist({
          college: req.user.college,
          department: req.user.department,
          course,
          semester: semesterNum,
          ...labRange,
        });
      } catch (e) {
        return fail(
          res,
          e.status || 400,
          `"${subject.name}" (${s.day}): ${e.message}`,
        );
      }

      const durationCheck = validateLectureDuration(startTime, endTime);
      if (!durationCheck.ok)
        return fail(
          res,
          400,
          `"${isGeneral ? s.type : subject.name}" (${s.day}): ${durationCheck.message}`,
        );

      let teacherDoc = null;
      if (!isGeneral && !s.teacher) {
        return fail(
          res,
          400,
          `Please select a teacher for "${subject.name}" (${s.day}${startTime ? " " + startTime : ""}) — a lecture with no teacher assigned would never show up on anyone's timetable.`,
        );
      }
      if (!isGeneral) {
        teacherDoc = await User.findOne({
          _id: s.teacher,
          college: req.user.college,
          department: req.user.department,
          role: { $in: ["teacher", "hod", "co_hod"] },
          ...live,
        })
          .select("name")
          .lean();
        if (!teacherDoc)
          return fail(
            res,
            400,
            `Selected teacher for "${subject.name}" (${s.day} ${startTime}) was not found in your department.`,
          );
      }

      // Conflict check: DB (excluding slots we're about to replace for this course+sem)
      const existingForThisClass = await Schedule.find({
        college: req.user.college,
        department: req.user.department,
        course,
        semester: semesterNum,
        day: s.day,
        ...live,
      })
        .select("_id")
        .lean();
      const excludeIds = existingForThisClass.map((d) => d._id);
      const dbConflict = await findConflictingSlotExcluding({
        college: req.user.college,
        department: req.user.department,
        course,
        semester: semesterNum,
        day: s.day,
        startTime,
        endTime,
        teacher: teacherDoc?._id,
        excludeIds,
        type: s.type || subject?.type || "Lecture",
        ...labRange,
      });
      if (dbConflict) return fail(res, 409, dbConflict.message);

      // Conflict check: against slots already accepted earlier in this same batch
      const currentSlotForConflict = {
        startTime,
        endTime,
        type: s.type || subject?.type || "Lecture",
        ...labRange,
      };
      const batchConflict = inBatchAccepted.find(
        (a) =>
          a.day === s.day &&
          (scheduleSlotsConflict(currentSlotForConflict, a) ||
            (a.teacher
              ? String(a.teacher) === String(teacherDoc?._id) &&
                teacherSlotsConflict(currentSlotForConflict, a)
              : false)),
      );
      if (batchConflict)
        return fail(
          res,
          409,
          `Overlapping slot found on ${s.day}. For labs, use different roll-number ranges for slots at the same time.`,
        );

      const t12 = startTime
        ? `${to12h(startTime)}${endTime ? " – " + to12h(endTime) : ""}`
        : s.time || "";
      const doc = {
        day: s.day,
        startTime,
        endTime,
        time: t12,
        subjectName: isGeneral ? s.type || s.subjectName : subject.name,
        subject: isGeneral ? null : subject._id,
        teacherName: teacherDoc?.name || "",
        teacher: teacherDoc?._id || null,
        room: s.room || "",
        type: isGeneral
          ? s.type || s.subjectName
          : s.type || subject.type || "Lecture",
        labRollStart: labRange.labRollStart,
        labRollEnd: labRange.labRollEnd,
        course,
        semester: semesterNum,
        college: req.user.college,
        department: req.user.department,
        createdBy: req.user.id,
      };
      resolved.push(doc);
      inBatchAccepted.push(doc);
    }

    // Validation passed for every slot — now persist: replace all slots for this course+sem.
    await Schedule.updateMany(
      {
        college: req.user.college,
        department: req.user.department,
        course,
        semester: semesterNum,
      },
      {
        $set: {
          isDeleted: true,
          active: false,
          deletedAt: new Date(),
          deletedBy: req.user.id,
        },
      },
    );
    const created =
      resolved.length > 0 ? await Schedule.insertMany(resolved) : [];
    ok(
      res,
      { saved: created.length, schedule: groupSchedule(created) },
      `Schedule saved: ${created.length} slots.`,
    );
  }),
);

// POST /api/hod/schedule/slot — add ONE lecture slot without touching any
// others (used by the Teacher Details "weekly schedule" builder, where a
// single teacher's lectures can span several different course/semester
// classes — unlike the bulk /schedule save above, which replaces a whole
// class's day-by-day timetable at once).
// Body: { day, startTime, endTime, department, course, semester, division?, room?, type?, subjectId|subjectName, teacher }
// Same spec-5/spec-6 guarantees as the bulk endpoint: master-list-only subject, conflict-checked.
router.post(
  "/schedule/slot",
  asyncHandler(async (req, res) => {
    const { day, startTime, endTime, course, division, room, type, teacher } =
      req.body;
    const semester = Number(req.body.semester);
    if (!day || !startTime || !endTime || !course || !semester) {
      return fail(
        res,
        400,
        "day, startTime, endTime, course and semester are required.",
      );
    }
    if (!teacher)
      return fail(res, 400, "A teacher must be selected for this lecture.");

    const durationCheck = validateLectureDuration(startTime, endTime);
    if (!durationCheck.ok) return fail(res, 400, durationCheck.message);

    let subject;
    try {
      subject = await resolveSubjectForSlot({
        college: req.user.college,
        department: req.user.department,
        course,
        semester,
        subjectId: req.body.subjectId,
        subjectName: req.body.subjectName,
      });
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }

    const teacherDoc = await User.findOne({
      _id: teacher,
      college: req.user.college,
      department: req.user.department,
      role: { $in: ["teacher", "hod", "co_hod"] },
      ...live,
    })
      .select("name")
      .lean();
    if (!teacherDoc)
      return fail(
        res,
        400,
        "Selected teacher was not found in your department.",
      );

    let labRange;
    try {
      labRange = normalizeLabRollRange({
        ...req.body,
        type: type || subject.type || "Lecture",
      });
      await ensureLabRollsExist({
        college: req.user.college,
        department: req.user.department,
        course,
        semester,
        ...labRange,
      });
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }

    const conflict = await findConflictingSlotExcluding({
      college: req.user.college,
      department: req.user.department,
      course,
      semester,
      day,
      startTime,
      endTime,
      teacher: teacherDoc._id,
      excludeIds: [],
      type: type || subject.type || "Lecture",
      ...labRange,
    });
    if (conflict) return fail(res, 409, conflict.message);

    const schedule = await Schedule.create({
      day,
      startTime,
      endTime,
      time: `${to12h(startTime)} – ${to12h(endTime)}`,
      subject: subject._id,
      subjectName: subject.name,
      teacher: teacherDoc._id,
      teacherName: teacherDoc.name,
      room: room || "",
      type: type || subject.type || "Lecture",
      labRollStart: labRange.labRollStart,
      labRollEnd: labRange.labRollEnd,
      course,
      semester,
      division: division || "",
      college: req.user.college,
      department: req.user.department,
      createdBy: req.user.id,
    });
    ok(res, { schedule }, "Lecture added to timetable.");
  }),
);

// PUT /api/hod/schedule/:id — update a single slot (same subject-lock + conflict rules as above)
router.put(
  "/schedule/:id",
  asyncHandler(async (req, res) => {
    const existing = await Schedule.findOne({
      _id: req.params.id,
      college: req.user.college,
      department: req.user.department,
    });
    if (!existing) return fail(res, 404, "Schedule slot not found.");

    const day = req.body.day || existing.day;
    const startTime = req.body.startTime || existing.startTime;
    const endTime = req.body.endTime || existing.endTime;
    const course = req.body.course || existing.course;
    const semesterNum = Number(req.body.semester || existing.semester);

    const body = { ...req.body, updatedBy: req.user.id };

    if (req.body.subjectId || req.body.subjectName) {
      let subject;
      try {
        subject = await resolveSubjectForSlot({
          college: req.user.college,
          department: req.user.department,
          course,
          semester: semesterNum,
          subjectId: req.body.subjectId,
          subjectName: req.body.subjectName,
        });
      } catch (e) {
        return fail(res, e.status || 400, e.message);
      }
      body.subject = subject._id;
      body.subjectName = subject.name;
    }

    let teacherId = existing.teacher;
    if (req.body.teacher) {
      const teacherDoc = await User.findOne({
        _id: req.body.teacher,
        college: req.user.college,
        department: req.user.department,
        role: { $in: ["teacher", "hod", "co_hod"] },
        ...live,
      })
        .select("name")
        .lean();
      if (!teacherDoc)
        return fail(
          res,
          400,
          "Selected teacher was not found in your department.",
        );
      body.teacher = teacherDoc._id;
      body.teacherName = teacherDoc.name;
      teacherId = teacherDoc._id;
    }

    if (body.startTime || body.endTime) {
      const durationCheck = validateLectureDuration(startTime, endTime);
      if (!durationCheck.ok) return fail(res, 400, durationCheck.message);
      body.time = `${to12h(startTime || "")}${endTime ? " – " + to12h(endTime) : ""}`;
    }

    try {
      const labRange = normalizeLabRollRange({
        ...existing.toObject(),
        ...body,
      });
      await ensureLabRollsExist({
        college: req.user.college,
        department: req.user.department,
        course,
        semester: semesterNum,
        ...labRange,
      });
      body.labRollStart = labRange.labRollStart;
      body.labRollEnd = labRange.labRollEnd;
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }

    const conflict = await findConflictingSlotExcluding({
      college: req.user.college,
      department: req.user.department,
      course,
      semester: semesterNum,
      day,
      startTime,
      endTime,
      teacher: teacherId,
      excludeIds: [existing._id],
      type: body.type || existing.type || "Lecture",
      labRollStart: body.labRollStart,
      labRollEnd: body.labRollEnd,
    });
    if (conflict) return fail(res, 409, conflict.message);

    const schedule = await Schedule.findOneAndUpdate(
      {
        _id: req.params.id,
        college: req.user.college,
        department: req.user.department,
      },
      body,
      { new: true },
    );
    if (!schedule) return fail(res, 404, "Schedule slot not found.");
    ok(res, { schedule }, "Schedule updated.");
  }),
);

// Conflict helper with lab roll-range awareness. Bulk saves pass the old
// course-semester slot ids here; single-slot updates pass only the slot being
// edited; new slots pass an empty list.
async function findConflictingSlotExcluding({
  college,
  department,
  course,
  semester,
  day,
  startTime,
  endTime,
  teacher,
  excludeIds,
  type,
  labRollStart,
  labRollEnd,
}) {
  const baseFilter = { college, ...live, day, _id: { $nin: excludeIds } };

  const classSlots = await Schedule.find({
    ...baseFilter,
    department,
    course,
    semester,
  })
    .populate("teacher", "name")
    .lean();
  for (const slot of classSlots) {
    if (
      scheduleSlotsConflict(
        { startTime, endTime, type, labRollStart, labRollEnd },
        slot,
      )
    ) {
      return {
        message: `This class already has a lecture scheduled during this time by ${slot.teacher?.name || slot.teacherName || "another teacher"}.`,
      };
    }
  }
  if (teacher) {
    const teacherSlots = await Schedule.find({ ...baseFilter, teacher }).lean();
    for (const slot of teacherSlots) {
      if (
        teacherSlotsConflict(
          { startTime, endTime, type, labRollStart, labRollEnd },
          slot,
        )
      ) {
        return {
          message: `This teacher already has a lecture scheduled during this time (${slot.course || ""} Sem ${slot.semester || ""}).`,
        };
      }
    }
  }
  return null;
}

// DELETE /api/hod/schedule/:id — delete a single slot
router.delete(
  "/schedule/:id",
  asyncHandler(async (req, res) => {
    const schedule = await Schedule.findOne({
      _id: req.params.id,
      college: req.user.college,
      department: req.user.department,
    });
    if (!schedule) return fail(res, 404, "Schedule slot not found.");
    await hardDeleteCascade(schedule, req.user);
    ok(res, {}, "Schedule slot deleted.");
  }),
);

// ── Announcements ──────────────────────────────────────────────────────────
router.get(
  "/announcements",
  asyncHandler(async (req, res) => {
    ok(res, {
      announcements: await Notice.find({
        college: req.user.college,
        $or: [
          { department: req.user.department },
          { department: null },
          { department: { $exists: false } },
        ],
        ...live,
      })
        .sort({ createdAt: -1 })
        .populate("author", "name"),
    });
  }),
);
router.post(
  "/announcements",
  asyncHandler(async (req, res) => {
    if (!req.body.title) return fail(res, 400, "Title is required.");
    let attachment;
    if (req.body.attachment) {
      try {
        attachment = await storeDataUri(
          validatePdfDataUri(req.body.attachment),
          `announcement-${Date.now()}`,
        );
      } catch (e) {
        return fail(res, e.status || 400, e.message);
      }
    }
    const ann = await Notice.create({
      ...req.body,
      body: req.body.body || req.body.message,
      message: req.body.message || req.body.body,
      sourceType: "announcement",
      course: req.body.course || undefined,
      semester:
        req.body.semester || req.body.sem
          ? Number(req.body.semester || req.body.sem)
          : undefined,
      targetRole: req.body.targetRole || "all",
      targetTeacherIds: Array.isArray(req.body.targetTeacherIds)
        ? req.body.targetTeacherIds
        : [],
      attachment,
      attachmentName: attachment
        ? req.body.attachmentName || "Announcement.pdf"
        : undefined,
      college: req.user.college,
      department: req.user.department,
      author: req.user.id,
      createdBy: req.user.id,
    });
    ok(res, { announcement: ann }, "Announcement posted.");
  }),
);
router.delete(
  "/announcements/:id",
  asyncHandler(async (req, res) => {
    const notice = await Notice.findOne({
      _id: req.params.id,
      college: req.user.college,
      department: req.user.department,
    });
    if (!notice) return fail(res, 404, "Announcement not found.");
    await hardDeleteCascade(notice, req.user);
    ok(res, {}, "Announcement permanently deleted.");
  }),
);

// ── Departments (read-only for HOD — reflects admin/super-admin changes) ──
router.get(
  "/departments",
  asyncHandler(async (req, res) => {
    const depts = await Department.find({ college: req.user.college, ...live })
      .populate("hod", "name email")
      .lean();
    const enriched = await Promise.all(
      depts.map(async (d) => {
        const [teacherCount, studentCount, courseCount] = await Promise.all([
          User.countDocuments({ department: d._id, role: "teacher", ...live }),
          Student.countDocuments({ department: d._id, isDeleted: false }),
          Course.countDocuments({ department: d._id, isDeleted: false }),
        ]);
        return {
          ...d,
          code: d.shortCode,
          teacherCount,
          studentCount,
          courseCount,
        };
      }),
    );
    ok(res, { departments: enriched });
  }),
);

// ── Courses (read-only for HOD — reflects admin/super-admin changes) ───────
router.get(
  "/courses",
  asyncHandler(async (req, res) => {
    const filter = { college: req.user.college, isDeleted: false };
    if (req.query.department) filter.department = req.query.department;
    else filter.department = req.user.department;
    const courses = await Course.find(filter)
      .populate("department", "name shortCode")
      .lean();
    const enriched = await Promise.all(
      courses.map(async (c) => ({
        ...c,
        studentCount: await Student.countDocuments({
          course: c.name,
          college: req.user.college,
          isDeleted: false,
        }),
      })),
    );
    ok(res, { courses: enriched });
  }),
);

// ── Class Coordinator (CC) — HOD appoints CC per semester ─────────────────
// GET  /api/hod/cc              — list all CC assignments
// POST /api/hod/cc              — assign/update CC for a course+sem
// DELETE /api/hod/cc/:teacherId — remove CC assignment

router.get(
  "/cc",
  asyncHandler(async (req, res) => {
    const ccs = await User.find({
      college: req.user.college,
      department: req.user.department,
      ccAssignments: { $exists: true, $not: { $size: 0 } },
      ...live,
    })
      .populate("department", "name shortCode")
      .lean();

    // Also fetch all teachers who have any ccAssignments
    const allCCTeachers = await User.find({
      college: req.user.college,
      department: req.user.department,
      "ccAssignments.0": { $exists: true },
      ...live,
    })
      .select("name email role ccAssignments")
      .lean();

    ok(res, { ccAssignments: allCCTeachers });
  }),
);

router.post(
  "/cc",
  asyncHandler(async (req, res) => {
    const { teacherId, course, semester } = req.body;
    if (!teacherId || !course || !semester)
      return fail(res, 400, "teacherId, course, and semester are required.");
    const teacher = await User.findOne({
      _id: teacherId,
      college: req.user.college,
      department: req.user.department,
      ...live,
    });
    if (!teacher)
      return fail(res, 404, "Teacher not found in your department.");

    // Remove existing CC for this course+sem in this department
    await User.updateMany(
      { college: req.user.college, department: req.user.department },
      { $pull: { ccAssignments: { course, semester: Number(semester) } } },
    );

    // Add CC assignment to teacher
    if (!Array.isArray(teacher.ccAssignments)) teacher.ccAssignments = [];
    await User.findByIdAndUpdate(teacherId, {
      $push: {
        ccAssignments: {
          course,
          semester: Number(semester),
          assignedBy: req.user.id,
          assignedAt: new Date(),
        },
      },
    });
    ok(res, {
      message: `${teacher.name} appointed as CC for ${course} Sem ${semester}.`,
    });
  }),
);

router.delete(
  "/cc",
  asyncHandler(async (req, res) => {
    const { teacherId, course, semester } = req.body;
    if (!teacherId) return fail(res, 400, "teacherId is required.");
    await User.findByIdAndUpdate(teacherId, {
      $pull: {
        ccAssignments:
          course && semester ? { course, semester: Number(semester) } : {},
      },
    });
    ok(res, {}, "CC assignment removed.");
  }),
);

// ── CC view: get students marks+attendance for a course+sem ────────────────
// GET /api/hod/cc/view?course=BCA&semester=3
router.get(
  "/cc/view",
  asyncHandler(async (req, res) => {
    const { course, semester } = req.query;
    if (!course || !semester)
      return fail(res, 400, "course and semester are required.");
    const filter = {
      college: req.user.college,
      department: req.user.department,
      isDeleted: false,
    };
    if (course) filter.$or = [{ course }, { courseName: course }];
    if (semester)
      filter.$or = [{ semester: Number(semester) }, { sem: Number(semester) }];

    const [students, marks, attendance] = await Promise.all([
      Student.find({
        college: req.user.college,
        department: req.user.department,
        $or: [{ course }, { courseName: course }],
        $and: [
          { $or: [{ semester: Number(semester) }, { sem: Number(semester) }] },
        ],
        isDeleted: false,
      }).lean(),
      Mark.find({
        college: req.user.college,
        department: req.user.department,
        course,
        semester: Number(semester),
      })
        .populate("student", "name roll")
        .populate("subject", "name code")
        .lean(),
      Attendance.find({
        college: req.user.college,
        department: req.user.department,
        course,
        semester: Number(semester),
      })
        .populate("student", "name roll")
        .populate("subject", "name code")
        .lean(),
    ]);
    ok(res, { students: students.map(mapStudent), marks, attendance });
  }),
);

// GET /api/hod/co-hod-history — spec item 4: the HOD's view of everything
// that's happened in their department (their own actions and their
// Co-HOD's), newest first.
router.get(
  "/co-hod-history",
  asyncHandler(async (req, res) => {
    const entries = await CoHodActivity.find({
      college: req.user.college,
      department: req.user.department,
    })
      .sort({ date: -1, createdAt: -1 })
      .limit(300)
      .lean();
    ok(res, { entries });
  }),
);

export default router;

import { Router } from "express";
import mongoose from "mongoose";
import Department from "../models/Department.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Subject from "../models/Subject.js";
import Notice from "../models/Notice.js";
import Attendance from "../models/Attendance.js";
import Mark from "../models/Mark.js";
import Course from "../models/Course.js";
import Schedule from "../models/Schedule.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fail, ok } from "../utils/respond.js";
import {
  hardDeleteCascade,
  hardDeleteManyCascade,
} from "../utils/hardDelete.js";
import { storeDataUri } from "../utils/gridfs.js";
import {
  createStudent,
  ensureUser,
  ensureEmailAvailable,
  live,
  logDeptActivity,
  mapStudent,
  mapTeacher,
  normalizeSubjectPayload,
  syncSubjectSchedule,
  updateStudentAndSyncParent,
  appointHod,
  detachHodFromDepartment,
  validateMobileNumber,
  validatePdfDataUri,
} from "../controllers/common.js";

const router = Router();
router.use(
  requireAuth,
  allowRoles("admin", "principal", "super_admin", "superadmin"),
);
const col = (req) => ({ college: req.user.college });
const colLive = (req) => ({ college: req.user.college, ...live });

// ── Dashboard / Overview ──────────────────────────────────────────────────
router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const scope = colLive(req);
    const [departments, students, teachers, courses, subjects, hods, notices] =
      await Promise.all([
        Department.countDocuments(scope),
        Student.countDocuments(scope),
        User.countDocuments({ ...scope, role: "teacher" }),
        Course.countDocuments({ ...scope }),
        Subject.countDocuments({ ...scope }),
        User.countDocuments({ ...scope, role: { $in: ["hod", "co_hod"] } }),
        Notice.countDocuments({ college: req.user.college, ...live }),
      ]);
    const faculty = teachers + hods;
    // dept health: attendance % per dept
    const deptList = await Department.find(scope).lean();
    const deptHealth = await Promise.all(
      deptList.map(async (d) => {
        const total = await Attendance.countDocuments({ department: d._id });
        const present = await Attendance.countDocuments({
          department: d._id,
          status: "present",
        });
        return {
          name: d.name,
          code: d.shortCode,
          att: total > 0 ? Math.round((present / total) * 100) : 0,
        };
      }),
    );
    ok(res, {
      departments,
      students,
      teachers,
      faculty,
      courses,
      subjects,
      hods,
      notices,
      users: faculty + students,
      deptHealth,
    });
  }),
);
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const scope = colLive(req);
    const [departments, students, teachers, hods, notices] = await Promise.all([
      Department.countDocuments(scope),
      Student.countDocuments(scope),
      User.countDocuments({ ...scope, role: "teacher" }),
      User.countDocuments({ ...scope, role: { $in: ["hod", "co_hod"] } }),
      Notice.countDocuments({ college: req.user.college, ...live }),
    ]);
    ok(res, {
      departments,
      students,
      teachers,
      hods,
      faculty: teachers + hods,
      notices,
    });
  }),
);
router.get(
  "/activity",
  asyncHandler(async (_req, res) => ok(res, { activities: [], data: [] })),
);
router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const College = (await import("../models/College.js")).default;
    const college = await College.findById(req.user.college).lean();
    ok(res, {
      college,
      collegeName: college?.name,
      institutionCode: college?.code,
      academicYear: college?.academicYear || "",
    });
  }),
);
router.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const College = (await import("../models/College.js")).default;
    const college = await College.findByIdAndUpdate(
      req.user.college,
      { ...req.body, updatedBy: req.user.id },
      { new: true },
    );
    ok(res, { college }, "Settings saved.");
  }),
);

// ── Departments ───────────────────────────────────────────────────────────
router.get(
  "/departments",
  asyncHandler(async (req, res) => {
    const depts = await Department.find(colLive(req))
      .populate("hod", "name email")
      .lean();
    const enriched = await Promise.all(
      depts.map(async (d) => {
        const [teacherCount, studentCount, courseCount, hodDoc] =
          await Promise.all([
            User.countDocuments({
              department: d._id,
              role: { $in: ["teacher", "hod", "co_hod"] },
              ...live,
            }),
            Student.countDocuments({ department: d._id, isDeleted: false }),
            Course.countDocuments({ department: d._id, isDeleted: false }),
            User.findOne({
              department: d._id,
              role: { $in: ["hod", "co_hod"] },
              ...live,
            })
              .select("name email")
              .lean(),
          ]);
        return {
          ...d,
          code: d.shortCode,
          teacherCount,
          studentCount,
          courseCount,
          hodId: hodDoc,
        };
      }),
    );
    ok(res, { departments: enriched, data: enriched });
  }),
);
router.post(
  "/departments",
  asyncHandler(async (req, res) => {
    if (!req.body.name) return fail(res, 400, "Department name is required.");
    const dept = await Department.create({
      name: req.body.name,
      shortCode:
        req.body.shortCode ||
        req.body.code ||
        req.body.name.slice(0, 6).toUpperCase(),
      college: req.user.college,
      createdBy: req.user.id,
      icon: req.body.icon,
      establishedYear: req.body.establishedYear,
      description: req.body.description,
    });
    ok(res, { department: dept }, "Department created.");
  }),
);
router.put(
  "/departments/:id",
  asyncHandler(async (req, res) => {
    const dept = await Department.findOneAndUpdate(
      { _id: req.params.id, college: req.user.college },
      { ...req.body, updatedBy: req.user.id },
      { new: true },
    );
    if (!dept) return fail(res, 404, "Department not found.");
    ok(res, { department: dept }, "Department updated.");
  }),
);
router.delete(
  "/departments/:id",
  asyncHandler(async (req, res) => {
    const dept = await Department.findOne({
      _id: req.params.id,
      college: req.user.college,
    });
    if (!dept) return fail(res, 404, "Department not found.");
    await hardDeleteCascade(dept, req.user);
    ok(res, {}, "Department permanently deleted.");
  }),
);

// ── Courses ───────────────────────────────────────────────────────────────
router.get(
  "/courses",
  asyncHandler(async (req, res) => {
    const filter = { college: req.user.college };
    if (req.query.department) filter.department = req.query.department;
    const courses = await Course.find({ ...filter, isDeleted: false }).lean();
    const enriched = await Promise.all(
      courses.map(async (c) => ({
        ...c,
        studentCount: await Student.countDocuments({
          college: req.user.college,
          isDeleted: false,
          $or: [
            { course: c.name },
            { courseName: c.name },
            { course: String(c._id) },
          ],
        }),
      })),
    );
    ok(res, { courses: enriched, data: enriched });
  }),
);
router.post(
  "/courses",
  asyncHandler(async (req, res) => {
    if (!req.body.name) return fail(res, 400, "Course name is required.");
    const course = await Course.create({
      ...req.body,
      department: req.body.departmentId || req.body.department,
      college: req.user.college,
      createdBy: req.user.id,
    });
    ok(res, { course }, "Course created.");
  }),
);
router.put(
  "/courses/:id",
  asyncHandler(async (req, res) => {
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, college: req.user.college },
      { ...req.body, updatedBy: req.user.id },
      { new: true },
    );
    if (!course) return fail(res, 404, "Course not found.");
    ok(res, { course }, "Course updated.");
  }),
);
router.delete(
  "/courses/:id",
  asyncHandler(async (req, res) => {
    const course = await Course.findOne({
      _id: req.params.id,
      college: req.user.college,
    });
    if (!course) return fail(res, 404, "Course not found.");
    await hardDeleteCascade(course, req.user);
    ok(res, {}, "Course permanently deleted.");
  }),
);

// ── HOD ───────────────────────────────────────────────────────────────────
// Spec (updated): Admin has full control — add, edit, delete. Super Admin
// can only VIEW (see super.routes.js — its generic staff edit/delete now
// explicitly blocks role hod/co_hod, while still allowing it for other
// roles like plain teachers).
router.get(
  "/hod",
  asyncHandler(async (req, res) => {
    const hods = await User.find({
      college: req.user.college,
      role: { $in: ["hod", "co_hod"] },
      ...live,
    })
      .populate("department", "name shortCode")
      .lean();
    ok(res, { hods: hods.map(mapTeacher) });
  }),
);
router.post(
  "/hod",
  asyncHandler(async (req, res) => {
    const deptId = req.body.departmentId || req.body.department;
    if (!deptId) return fail(res, 400, "Department is required.");
    const dept = await Department.findOne({
      _id: deptId,
      college: req.user.college,
    });
    if (!dept) return fail(res, 404, "Department not found.");
    if (!req.body.email) return fail(res, 400, "Email is required.");
    const role = req.body.role === "co_hod" ? "co_hod" : "hod";
    const user = await ensureUser(
      {
        ...req.body,
        role,
        college: req.user.college,
        department: dept.id,
        designation: role === "co_hod" ? "Co-Dept Admin" : "Dept Admin",
      },
      req.user.id,
    );
    try {
      await appointHod({ dept, role, user });
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }
    await logDeptActivity({
      college: req.user.college,
      department: dept.id,
      actor: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role,
      message: `${user.name} was appointed as ${role === "co_hod" ? "Co-Dept Admin" : "Dept Admin"} by ${req.user.name}.`,
    });
    ok(
      res,
      { user: mapTeacher(user) },
      `${role === "co_hod" ? "Co-Dept Admin" : "Dept Admin"} appointed.`,
    );
  }),
);
router.put(
  "/hod/:id",
  asyncHandler(async (req, res) => {
    const body = { ...req.body, updatedBy: req.user.id };
    if (body.email) {
      try {
        body.email = await ensureEmailAvailable(body.email, {
          excludeUserId: req.params.id,
        });
      } catch (e) {
        return fail(res, e.status || 400, e.message);
      }
    }
    if ("emergencyContact" in body) {
      try {
        body.emergencyContact = validateMobileNumber(body.emergencyContact);
      } catch (e) {
        return fail(res, e.status || 400, e.message);
      }
    }
    const user = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        college: req.user.college,
        role: { $in: ["hod", "co_hod"] },
      },
      body,
      { new: true },
    );
    if (!user) return fail(res, 404, "HOD not found.");
    ok(res, { user: mapTeacher(user) }, "HOD updated.");
  }),
);
router.delete(
  "/hod/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      _id: req.params.id,
      college: req.user.college,
      role: { $in: ["hod", "co_hod"] },
    });
    if (!user) return fail(res, 404, "HOD not found.");
    const wasCoHod = user.role === "co_hod";
    const deptId = user.department;
    await logDeptActivity({
      college: req.user.college,
      department: deptId,
      actor: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role,
      message: `${user.name} was removed as ${wasCoHod ? "Co-Dept Admin" : "Dept Admin"} by ${req.user.name}.`,
    });
    await hardDeleteCascade(user, req.user);
    ok(res, {}, "HOD permanently deleted.");
  }),
);

// ── Subjects ──────────────────────────────────────────────────────────────
// Read-only for Admin — subjects are now added/edited/removed by each
// department's Dept Admin/Co-Dept Admin (see routes/hod.routes.js). Admin sees everything
// here, filterable by department, course, and/or semester, or all at once.
router.get(
  "/subjects",
  asyncHandler(async (req, res) => {
    const filter = colLive(req);
    if (req.query.departmentId) filter.department = req.query.departmentId;
    if (req.query.department) filter.department = req.query.department;
    if (req.query.course) {
      const courseOr = [{ name: req.query.course }, { code: req.query.course }];
      if (mongoose.Types.ObjectId.isValid(req.query.course))
        courseOr.unshift({ _id: req.query.course });
      const courseDoc = await Course.findOne({
        college: req.user.college,
        $or: courseOr,
      }).lean();
      filter.course = courseDoc?.name || req.query.course;
    }
    if (req.query.semester) filter.semester = Number(req.query.semester);
    const subjects = await Subject.find(filter)
      .populate("department", "name")
      .populate("teacher", "name email")
      .lean();
    ok(res, { subjects, data: subjects });
  }),
);
router.post(
  "/subjects",
  asyncHandler(async (req, res) => {
    fail(
      res,
      403,
      "Subjects are managed by each department's Dept Admin/Co-Dept Admin now, not Admin.",
    );
  }),
);
router.put(
  "/subjects/:id",
  asyncHandler(async (req, res) => {
    fail(
      res,
      403,
      "Subjects are managed by each department's Dept Admin/Co-Dept Admin now, not Admin.",
    );
  }),
);
router.delete(
  "/subjects/:id",
  asyncHandler(async (req, res) => {
    fail(
      res,
      403,
      "Subjects are managed by each department's Dept Admin/Co-Dept Admin now, not Admin.",
    );
  }),
);

// ── Teachers / Faculty ────────────────────────────────────────────────────
router.get(
  "/teachers",
  asyncHandler(async (req, res) => {
    const filter = {
      college: req.user.college,
      role: { $in: ["teacher", "hod", "co_hod"] },
      ...live,
    };
    if (req.query.departmentId) filter.department = req.query.departmentId;
    const page = Number(req.query.page || 1),
      limit = Number(req.query.limit || 20);
    if (req.query.search) {
      const re = new RegExp(req.query.search, "i");
      filter.$or = [{ name: re }, { email: re }];
    }
    const [list, total] = await Promise.all([
      User.find(filter)
        .populate("department", "name shortCode")
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    ok(res, {
      teachers: list.map(mapTeacher),
      data: list.map(mapTeacher),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }),
);
router.post(
  "/teachers",
  asyncHandler(async (req, res) => {
    if (!req.body.email) return fail(res, 400, "Email is required.");
    const user = await ensureUser(
      {
        ...req.body,
        role: "teacher",
        college: req.user.college,
        department: req.body.departmentId || req.body.department,
      },
      req.user.id,
    );
    ok(res, { user: mapTeacher(user) }, "Teacher created.");
  }),
);
router.post(
  "/faculty",
  asyncHandler(async (req, res) => {
    if (!req.body.email) return fail(res, 400, "Email is required.");
    const user = await ensureUser(
      {
        ...req.body,
        role: req.body.role || "teacher",
        college: req.user.college,
        department: req.body.departmentId || req.body.department,
      },
      req.user.id,
    );
    ok(res, { user: mapTeacher(user) }, "Faculty created.");
  }),
);
router.put(
  "/teachers/:id",
  asyncHandler(async (req, res) => {
    const body = { ...req.body, updatedBy: req.user.id };
    if (body.email) {
      try {
        body.email = await ensureEmailAvailable(body.email, {
          excludeUserId: req.params.id,
        });
      } catch (e) {
        return fail(res, e.status || 400, e.message);
      }
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, college: req.user.college },
      body,
      { new: true },
    );
    if (!user) return fail(res, 404, "Teacher not found.");
    ok(res, { user: mapTeacher(user) }, "Teacher updated.");
  }),
);
router.delete(
  "/teachers/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      _id: req.params.id,
      college: req.user.college,
    });
    if (!user) return fail(res, 404, "Teacher not found.");
    await hardDeleteCascade(user, req.user);
    ok(res, {}, "Teacher permanently deleted.");
  }),
);

// ── Students ──────────────────────────────────────────────────────────────
router.get(
  "/students",
  asyncHandler(async (req, res) => {
    const filter = colLive(req);
    if (req.query.departmentId) filter.department = req.query.departmentId;
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
    const page = Number(req.query.page || 1),
      limit = Number(req.query.limit || 20);
    if (req.query.search) {
      const re = new RegExp(req.query.search, "i");
      filter.$or = [{ name: re }, { email: re }, { roll: re }, { rollNo: re }];
    }
    const [list, total] = await Promise.all([
      Student.find(filter)
        .populate("department", "name shortCode")
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);
    ok(res, {
      students: list.map(mapStudent),
      data: list.map(mapStudent),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }),
);
router.post(
  "/students",
  asyncHandler(async (req, res) => {
    const student = await createStudent(
      { ...req.body, department: req.body.departmentId || req.body.department },
      req.user,
    );
    ok(res, { student: mapStudent(student) }, "Student created.");
  }),
);
router.put(
  "/students/:id",
  asyncHandler(async (req, res) => {
    let student;
    try {
      student = await updateStudentAndSyncParent(
        { _id: req.params.id, college: req.user.college },
        req.body,
        req.user.id,
      );
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }
    if (!student) return fail(res, 404, "Student not found.");
    ok(res, { student: mapStudent(student) }, "Student updated.");
  }),
);
router.delete(
  "/students/:id",
  asyncHandler(async (req, res) => {
    const student = await Student.findOne({
      _id: req.params.id,
      college: req.user.college,
    });
    if (!student) return fail(res, 404, "Student not found.");
    await hardDeleteCascade(student, req.user);
    ok(res, {}, "Student permanently deleted.");
  }),
);

// ── Users ─────────────────────────────────────────────────────────────────
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const filter = { college: req.user.college, ...live };
    if (req.query.role) filter.role = req.query.role;
    const users = await User.find(filter)
      .populate("department", "name shortCode")
      .lean();
    ok(res, { users: users.map(mapTeacher), data: users.map(mapTeacher) });
  }),
);
router.post(
  "/users/:id/toggle",
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      _id: req.params.id,
      college: req.user.college,
    });
    if (!user) return fail(res, 404, "User not found.");
    user.active = !user.active;
    user.updatedBy = req.user.id;
    await user.save();
    ok(
      res,
      { user: mapTeacher(user) },
      user.active ? "User activated." : "User deactivated.",
    );
  }),
);
router.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    let row = await User.findOne({
      _id: req.params.id,
      college: req.user.college,
    });
    if (!row)
      row = await Student.findOne({
        _id: req.params.id,
        college: req.user.college,
      });
    if (!row) return fail(res, 404, "Record not found.");
    await hardDeleteCascade(row, req.user);
    ok(res, {}, "Record permanently deleted.");
  }),
);

// ── Notices ───────────────────────────────────────────────────────────────
router.get(
  "/notices",
  asyncHandler(async (req, res) => {
    const notices = await Notice.find({ college: req.user.college, ...live })
      .sort({ date: -1, createdAt: -1 })
      .populate("author", "name")
      .populate("createdBy", "name role")
      .lean();
    ok(res, { notices, data: notices });
  }),
);
router.post(
  "/notices",
  asyncHandler(async (req, res) => {
    if (!req.body.title) return fail(res, 400, "Notice title is required.");
    let attachment;
    if (req.body.attachment) {
      try {
        attachment = await storeDataUri(
          validatePdfDataUri(req.body.attachment),
          `notice-${Date.now()}`,
        );
      } catch (e) {
        return fail(res, e.status || 400, e.message);
      }
    }
    const notice = await Notice.create({
      ...req.body,
      message: req.body.message || req.body.body,
      body: req.body.body || req.body.message,
      sourceType: "notice",
      course: req.body.course || undefined,
      semester: req.body.semester ? Number(req.body.semester) : undefined,
      attachment,
      attachmentName: attachment
        ? req.body.attachmentName || "Notice.pdf"
        : undefined,
      college: req.user.college,
      author: req.user.id,
      createdBy: req.user.id,
    });
    ok(res, { notice }, "Notice created.");
  }),
);
router.delete(
  "/notices/:id",
  asyncHandler(async (req, res) => {
    const notice = await Notice.findOne({
      _id: req.params.id,
      college: req.user.college,
    });
    if (!notice) return fail(res, 404, "Notice not found.");
    await hardDeleteCascade(notice, req.user);
    ok(res, {}, "Notice permanently deleted.");
  }),
);

// ── Reports ───────────────────────────────────────────────────────────────
router.get(
  "/reports/overview",
  asyncHandler(async (req, res) => {
    const scope = colLive(req);
    const [departments, students, teachers] = await Promise.all([
      Department.countDocuments(scope),
      Student.countDocuments(scope),
      User.countDocuments({ ...scope, role: "teacher" }),
    ]);
    ok(res, { departments, students, teachers });
  }),
);
router.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const filter = { college: req.user.college };
    const attendance = await Attendance.find({ ...filter, ...live })
      .populate("student", "name roll")
      .populate("subject", "name")
      .limit(500)
      .lean();
    ok(res, { attendance });
  }),
);
router.get(
  "/marks",
  asyncHandler(async (req, res) => {
    const marks = await Mark.find({ college: req.user.college, ...live })
      .populate("student", "name roll")
      .populate("subject", "name code")
      .lean();
    ok(res, { marks });
  }),
);

export default router;

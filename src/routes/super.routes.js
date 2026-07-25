import { Router } from "express";
import College from "../models/College.js";
import Department from "../models/Department.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Course from "../models/Course.js";
import Subject from "../models/Subject.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fail, ok } from "../utils/respond.js";
import { hardDeleteCascade } from "../utils/hardDelete.js";
import {
  collegeSummary,
  compareDeletionPassword,
  createStudent,
  ensureUser,
  hashDeletionPassword,
  live,
  mapStudent,
  mapTeacher,
} from "../controllers/common.js";

const router = Router();
router.use(requireAuth, allowRoles("super_admin", "superadmin"));

// ── Analytics ─────────────────────────────────────────────────────────────
router.get(
  "/analytics",
  asyncHandler(async (_req, res) => {
    const [
      collegeTotal,
      collegeActive,
      departments,
      principals,
      hods,
      teachers,
      studentTotal,
      studentActive,
      allColleges,
    ] = await Promise.all([
      College.countDocuments({ isDeleted: false }),
      College.countDocuments({ isDeleted: false, active: true }),
      Department.countDocuments(live),
      User.countDocuments({ role: { $in: ["admin", "principal"] }, ...live }),
      User.countDocuments({ role: { $in: ["hod", "co_hod"] }, ...live }),
      User.countDocuments({ role: "teacher", ...live }),
      Student.countDocuments(live),
      Student.countDocuments({ ...live, active: true }),
      College.find({ isDeleted: false }).select("name code active").sort({ name: 1 }).lean(),
    ]);

    // Per-college headcount — every role (students + teachers/HODs + principals/admins)
    // rolled into one "total people" number, plus the breakdown behind it, so
    // Analytics can show one box per college instead of only a global total.
    const perCollege = await Promise.all(
      allColleges.map(async (c) => {
        const stats = await collegeSummary(c._id);
        return {
          id: c._id,
          name: c.name,
          code: c.code || "",
          active: !!c.active,
          totalPeople: stats.totalPeople,
          students: stats.students,
          teachers: stats.teachers,
          principals: stats.principals,
          departments: stats.departments,
        };
      }),
    );

    ok(res, {
      colleges: {
        total: collegeTotal,
        active: collegeActive,
        inactive: collegeTotal - collegeActive,
      },
      departments,
      staff: {
        total: principals + hods + teachers,
        principals,
        hods,
        teachers,
        faculty: hods + teachers,
      },
      students: {
        total: studentTotal,
        active: studentActive,
        inactive: studentTotal - studentActive,
      },
      perCollege,
    });
  }),
);

// ── Colleges ──────────────────────────────────────────────────────────────
router.get(
  "/colleges",
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.max(Number(req.query.limit || 8), 1);
    const filter = { isDeleted: false };
    if (req.query.filter === "active") filter.active = true;
    if (req.query.filter === "inactive") filter.active = false;
    if (req.query.search) {
      const re = new RegExp(req.query.search, "i");
      filter.$or = [{ name: re }, { code: re }, { email: re }];
    }
    const [rows, total] = await Promise.all([
      College.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      College.countDocuments(filter),
    ]);
    const colleges = await Promise.all(
      rows.map(async (c) => {
        const stats = await collegeSummary(c.id);
        const principals = await User.find({
          college: c.id,
          role: { $in: ["admin", "principal"] },
          ...live,
        })
          .select("name email")
          .lean();
        return {
          ...c.toJSON(),
          ...c.address,
          departmentCount: stats.departments,
          stats,
          principals,
        };
      }),
    );
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    ok(res, {
      colleges,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
    });
  }),
);

router.post(
  "/colleges",
  asyncHandler(async (req, res) => {
    const {
      name,
      code,
      deletionPassword,
      email,
      phone,
      website,
      address,
      city,
      state,
      pincode,
    } = req.body;
    if (!name || !code || !deletionPassword)
      return fail(res, 400, "Name, code and deletion password are required.");
    const existing = await College.findOne({
      code: String(code).toUpperCase(),
      isDeleted: false,
    });
    if (existing)
      return fail(res, 409, "College with this code already exists.");
    const college = await College.create({
      name,
      code: String(code).toUpperCase(),
      email,
      phone,
      website,
      address:
        typeof address === "object"
          ? address
          : { street: address, city, state, pincode },
      city,
      state,
      pincode,
      deletionPasswordHash: await hashDeletionPassword(deletionPassword),
      createdBy: req.user.id,
      active: true,
    });
    ok(res, { college }, "College created successfully.");
  }),
);

router.get(
  "/colleges/:id",
  asyncHandler(async (req, res) => {
    const college = await College.findById(req.params.id);
    if (!college || college.isDeleted)
      return fail(res, 404, "College not found.");
    const [deptRows, principals, hods, teachers] = await Promise.all([
      Department.find({ college: college.id, ...live })
        .populate("hod", "name email")
        .lean(),
      User.find({
        college: college.id,
        role: { $in: ["admin", "principal"] },
        ...live,
      })
        .populate("createdBy", "name role")
        .lean(),
      User.find({
        college: college.id,
        role: { $in: ["hod", "co_hod"] },
        ...live,
      })
        .populate("department", "name code")
        .populate("createdBy", "name role")
        .lean(),
      User.find({ college: college.id, role: "teacher", ...live })
        .populate("department", "name code")
        .populate("createdBy", "name role")
        .lean(),
    ]);
    const departments = await Promise.all(
      deptRows.map(async (d) => {
        const [hodUsers, teacherCount, facultyCount, students] =
          await Promise.all([
            User.find({
              department: d._id,
              role: { $in: ["hod", "co_hod"] },
              ...live,
            }).lean(),
            User.countDocuments({
              department: d._id,
              role: "teacher",
              ...live,
            }),
            User.countDocuments({
              department: d._id,
              role: { $in: ["teacher", "hod", "co_hod"] },
              ...live,
            }),
            Student.find({ department: d._id, isDeleted: false }).lean(),
          ]);
        return {
          ...d,
          code: d.shortCode || d.code,
          hods: hodUsers,
          teacherCount,
          facultyCount,
          studentStats: {
            total: students.length,
            active: students.filter((s) => s.active !== false).length,
            inactive: students.filter((s) => s.active === false).length,
            boys: students.filter((s) => /^m/i.test(s.gender || "")).length,
            girls: students.filter((s) => /^f/i.test(s.gender || "")).length,
            other: students.filter((s) => !/^[mf]/i.test(s.gender || ""))
              .length,
          },
        };
      }),
    );
    const allStudents = await Student.find({
      college: college.id,
      isDeleted: false,
    }).lean();
    ok(res, {
      college: { ...college.toJSON(), ...college.address },
      departments,
      principals: principals.map(mapTeacher),
      hods: hods.map(mapTeacher),
      teachers: teachers.map(mapTeacher),
      studentStats: {
        total: allStudents.length,
        active: allStudents.filter((s) => s.active !== false).length,
        inactive: allStudents.filter((s) => s.active === false).length,
        boys: allStudents.filter((s) => /^m/i.test(s.gender || "")).length,
        girls: allStudents.filter((s) => /^f/i.test(s.gender || "")).length,
        other: allStudents.filter((s) => !/^[mf]/i.test(s.gender || "")).length,
      },
    });
  }),
);

router.put(
  "/colleges/:id",
  asyncHandler(async (req, res) => {
    // Whitelist: only these fields are editable via this endpoint. Never
    // spread req.body directly into an update — that would let a crafted
    // payload silently overwrite deletionPasswordHash, isDeleted, active,
    // createdBy, etc.
    const { name, code, email, phone, website, address, city, state, pincode } = req.body;
    const update = { updatedBy: req.user.id };
    if (name !== undefined) update.name = name;
    if (code !== undefined) update.code = String(code).toUpperCase();
    if (email !== undefined) update.email = email;
    if (phone !== undefined) update.phone = phone;
    if (website !== undefined) update.website = website;
    if (city !== undefined) update.city = city;
    if (state !== undefined) update.state = state;
    if (pincode !== undefined) update.pincode = pincode;
    if (address !== undefined) {
      update.address = typeof address === "object" ? address : { street: address, city, state, pincode };
    }
    if (update.code) {
      const dupe = await College.findOne({ code: update.code, isDeleted: false, _id: { $ne: req.params.id } });
      if (dupe) return fail(res, 409, "Another college is already using this code.");
    }
    const college = await College.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!college) return fail(res, 404, "College not found.");
    ok(res, { college }, "College updated.");
  }),
);

router.patch(
  "/colleges/:id/toggle",
  asyncHandler(async (req, res) => {
    const college = await College.findById(req.params.id);
    if (!college || college.isDeleted)
      return fail(res, 404, "College not found.");
    college.active = !college.active;
    college.updatedBy = req.user.id;
    await college.save();
    ok(
      res,
      { college },
      college.active ? "College activated." : "College deactivated.",
    );
  }),
);

router.delete(
  "/colleges/:id",
  asyncHandler(async (req, res) => {
    const college = await College.findById(req.params.id).select(
      "+deletionPasswordHash",
    );
    if (!college) return fail(res, 404, "College not found.");
    if (
      !(await compareDeletionPassword(
        req.body.deletionPassword,
        college.deletionPasswordHash,
      ))
    )
      return fail(res, 403, "Invalid deletion password.");
    await hardDeleteCascade(college, req.user);
    ok(res, { college }, "College permanently deleted.");
  }),
);

router.get(
  "/colleges/:id/departments",
  asyncHandler(async (req, res) => {
    ok(res, {
      departments: await Department.find({ college: req.params.id, ...live })
        .populate("hod", "name email")
        .lean(),
    });
  }),
);

// ── Departments ───────────────────────────────────────────────────────────
router.post(
  "/colleges/:collegeId/departments",
  asyncHandler(async (req, res) => {
    const college = await College.findById(req.params.collegeId);
    if (!college || college.isDeleted)
      return fail(res, 404, "College not found.");
    const dept = await Department.create({
      name: req.body.name,
      shortCode: req.body.shortCode || req.body.code,
      college: req.params.collegeId,
      createdBy: req.user.id,
    });
    ok(res, { department: dept }, "Department created.");
  }),
);

router.get(
  "/departments/:id/detail",
  asyncHandler(async (req, res) => {
    const department = await Department.findById(req.params.id)
      .populate("college", "name code")
      .populate("hod", "name email");
    if (!department || department.isDeleted)
      return fail(res, 404, "Department not found.");
    const [staff, students, courses] = await Promise.all([
      User.find({
        department: department.id,
        role: { $in: ["hod", "co_hod", "teacher"] },
        ...live,
      })
        .populate("createdBy", "name role")
        .lean(),
      Student.find({ department: department.id, isDeleted: false }).lean(),
      Course.find({ department: department.id, isDeleted: false }).lean(),
    ]);
    const hods = staff
      .filter((t) => ["hod", "co_hod"].includes(t.role))
      .map(mapTeacher);
    const teachers = staff.filter((t) => t.role === "teacher").map(mapTeacher);
    ok(res, {
      dept: { ...department.toJSON(), code: department.shortCode },
      department,
      college: department.college,
      hod: department.hod,
      hods,
      teachers,
      facultyCount: hods.length + teachers.length,
      students: students.map(mapStudent),
      courses,
      stats: {
        total: students.length,
        active: students.filter((s) => s.active !== false).length,
        inactive: students.filter((s) => s.active === false).length,
        boys: students.filter((s) => /^m/i.test(s.gender || "")).length,
        girls: students.filter((s) => /^f/i.test(s.gender || "")).length,
        other: students.filter((s) => !/^[mf]/i.test(s.gender || "")).length,
      },
    });
  }),
);

router.put(
  "/departments/:id",
  asyncHandler(async (req, res) => {
    const dept = await Department.findByIdAndUpdate(
      req.params.id,
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
    const department = await Department.findById(req.params.id);
    if (!department) return fail(res, 404, "Department not found.");
    await hardDeleteCascade(department, req.user);
    ok(res, { department }, "Department permanently deleted.");
  }),
);

// ── Staff ─────────────────────────────────────────────────────────────────
router.post(
  "/colleges/:collegeId/principals",
  asyncHandler(async (req, res) => {
    const college = await College.findById(req.params.collegeId);
    if (!college || college.isDeleted)
      return fail(res, 404, "College not found.");
    const user = await ensureUser(
      {
        ...req.body,
        role: "admin",
        college: req.params.collegeId,
        designation: "Principal",
      },
      req.user.id,
    );
    ok(res, { user: mapTeacher(user) }, "Principal appointed.");
  }),
);

// Spec (updated): Super Admin can only VIEW HOD/Co-HOD — Admin has sole
// control to add/edit/delete them (see admin.routes.js). Super Admin can
// still add plain teachers below — this restriction is specific to the
// HOD/Co-HOD role.
router.post(
  "/departments/:deptId/hods",
  asyncHandler(async (req, res) => {
    fail(
      res,
      403,
      "Only Admin can appoint a HOD/Co-HOD. Super Admin can view them here.",
    );
  }),
);

router.post(
  "/departments/:deptId/teachers",
  asyncHandler(async (req, res) => {
    const dept = await Department.findById(req.params.deptId);
    if (!dept) return fail(res, 404, "Department not found.");
    const user = await ensureUser(
      {
        ...req.body,
        role: "teacher",
        college: dept.college,
        department: dept.id,
        designation: "Teacher",
      },
      req.user.id,
    );
    ok(res, { user: mapTeacher(user) }, "Teacher added.");
  }),
);

router.get(
  "/staff",
  asyncHandler(async (req, res) => {
    const filter = {
      role: { $in: ["admin", "principal", "hod", "co_hod", "teacher"] },
      ...live,
    };
    if (req.query.college) filter.college = req.query.college;
    if (req.query.department) filter.department = req.query.department;
    const staff = await User.find(filter)
      .populate("college", "name code")
      .populate("department", "name shortCode")
      .lean();
    ok(res, { staff: staff.map(mapTeacher) });
  }),
);

router.get(
  "/staff/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
      .populate("department", "name code")
      .lean();
    if (!user) return fail(res, 404, "User not found.");
    ok(res, { user: mapTeacher(user), success: true });
  }),
);

// Spec (updated): Super Admin can view but not edit/delete a HOD/Co-HOD —
// Admin has sole control over those (see admin.routes.js PUT/DELETE
// /hod/:id). Editing/deleting other staff (e.g. plain teachers) is unaffected.
router.put(
  "/staff/:id",
  asyncHandler(async (req, res) => {
    const existing = await User.findById(req.params.id).select("role").lean();
    if (!existing) return fail(res, 404, "User not found.");
    if (["hod", "co_hod"].includes(existing.role)) {
      return fail(
        res,
        403,
        "Only Admin can edit a HOD/Co-HOD. Super Admin can view them here.",
      );
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user.id },
      { new: true },
    );
    if (!user) return fail(res, 404, "User not found.");
    ok(res, { user: mapTeacher(user) }, "Staff updated.");
  }),
);

router.delete(
  "/staff/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 404, "User not found.");
    if (["hod", "co_hod"].includes(user.role)) {
      return fail(
        res,
        403,
        "Only Admin can remove a HOD/Co-HOD. Super Admin can view them here.",
      );
    }
    await hardDeleteCascade(user, req.user);
    ok(res, {}, "User permanently deleted.");
  }),
);

// ── Students ──────────────────────────────────────────────────────────────
router.get(
  "/students/:id",
  asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id)
      .populate("department", "name shortCode")
      .lean();
    if (!student || student.isDeleted)
      return fail(res, 404, "Student not found.");
    ok(res, {
      student: mapStudent(student),
      user: mapStudent(student),
      success: true,
    });
  }),
);

router.post(
  "/departments/:deptId/students",
  asyncHandler(async (req, res) => {
    const dept = await Department.findById(req.params.deptId);
    if (!dept) return fail(res, 404, "Department not found.");
    const student = await createStudent(
      { ...req.body, college: dept.college, department: dept.id },
      req.user,
    );
    ok(res, { student: mapStudent(student) }, "Student added.");
  }),
);

router.put(
  "/students/:id",
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    if (body.courseName && !body.course) body.course = body.courseName;
    if (body.course && !body.courseName) body.courseName = body.course;
    if (body.sem && !body.semester) body.semester = Number(body.sem);
    if (body.semester && !body.sem) body.sem = Number(body.semester);
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { ...body, updatedBy: req.user.id },
      { new: true },
    );
    if (!student) return fail(res, 404, "Student not found.");
    ok(res, { student: mapStudent(student) }, "Student updated.");
  }),
);

router.delete(
  "/students/:id",
  asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id);
    if (!student) return fail(res, 404, "Student not found.");
    await hardDeleteCascade(student, req.user);
    ok(res, {}, "Student permanently deleted.");
  }),
);

// ── Courses ───────────────────────────────────────────────────────────────
router.get(
  "/departments/:deptId/courses",
  asyncHandler(async (req, res) => {
    const courses = await Course.find({
      department: req.params.deptId,
      isDeleted: false,
    })
      .populate("headTeacher", "name email")
      .lean();
    ok(res, { courses, success: true });
  }),
);

router.post(
  "/departments/:deptId/courses",
  asyncHandler(async (req, res) => {
    const dept = await Department.findById(req.params.deptId);
    if (!dept) return fail(res, 404, "Department not found.");
    const course = await Course.create({
      ...req.body,
      department: req.params.deptId,
      college: dept.college,
      createdBy: req.user.id,
    });
    ok(res, { course }, "Course created.");
  }),
);

router.put(
  "/courses/:id",
  asyncHandler(async (req, res) => {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
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
    const course = await Course.findById(req.params.id);
    if (!course) return fail(res, 404, "Course not found.");
    await hardDeleteCascade(course, req.user);
    ok(res, {}, "Course permanently deleted.");
  }),
);

router.post(
  "/courses/:courseId/head-teacher",
  asyncHandler(async (req, res) => {
    const course = await Course.findById(req.params.courseId);
    if (!course) return fail(res, 404, "Course not found.");
    const user = await ensureUser(
      {
        ...req.body,
        role: "teacher",
        college: course.college,
        department: course.department,
      },
      req.user.id,
    );
    course.headTeacher = user.id;
    await course.save();
    ok(res, { course, user: mapTeacher(user) }, "Head teacher assigned.");
  }),
);

// ── Subjects (via courses) ────────────────────────────────────────────────
router.post(
  "/courses/:courseId/subjects",
  asyncHandler(async (req, res) => {
    const course = await Course.findById(req.params.courseId);
    if (!course) return fail(res, 404, "Course not found.");
    const subject = await Subject.create({
      ...req.body,
      course: req.params.courseId,
      department: course.department,
      college: course.college,
      createdBy: req.user.id,
    });
    ok(res, { subject }, "Subject added.");
  }),
);

router.delete(
  "/courses/:courseId/subjects/:subjId",
  asyncHandler(async (req, res) => {
    const subject = await Subject.findById(req.params.subjId);
    if (!subject) return fail(res, 404, "Subject not found.");
    await hardDeleteCascade(subject, req.user);
    ok(res, {}, "Subject permanently deleted.");
  }),
);

export default router;

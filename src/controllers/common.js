import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import College from "../models/College.js";
import Department from "../models/Department.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Subject from "../models/Subject.js";
import Course from "../models/Course.js";
import Notice from "../models/Notice.js";
import Attendance from "../models/Attendance.js";
import Mark from "../models/Mark.js";
import Schedule from "../models/Schedule.js";
import Syllabus from "../models/Syllabus.js";
import CoHodActivity from "../models/CoHodActivity.js";

export const live = { isDeleted: false };

// Spec item 4: Co-Dept Admin / department activity history. Records who did what
// against a specific department — called both from Dept Admin routes (their
// own actions) and from Admin routes (e.g. appointing/removing a Co-Dept Admin),
// so the Dept Admin's history page shows the complete picture, including how the
// Co-Dept Admin came to be there in the first place. Never throws — a logging
// failure should never block the action itself.
export async function logDeptActivity({
  college,
  department,
  actor,
  actorName,
  actorRole,
  message,
}) {
  try {
    if (!department) return;
    await CoHodActivity.create({
      college,
      department,
      actor,
      actorName,
      actorRole: actorRole || "hod",
      message,
    });
  } catch (_) {
    /* best-effort logging only */
  }
}

export async function logCoHodActivity(user, message) {
  return logDeptActivity({
    college: user.college,
    department: user.department,
    actor: user.id || user._id,
    actorName: user.name,
    actorRole: user.role,
    message,
  });
}
export const idOf = (value) => value?._id || value;

export function roleIs(user, ...roles) {
  return roles.includes(user.role);
}

// Validates a profile-photo upload. Photos are stored as data URIs directly on
// the Student/User document (see model comments) rather than on local disk —
// deliberately, since this app must run on AWS EC2 without assuming a
// persistent/shared filesystem or any pre-configured S3 bucket. This keeps
// "one image reference" per person and needs zero extra infra to deploy.
// Validates a PDF attachment (syllabus document, announcement, notice).
// Same data-URI-in-MongoDB approach as photos (see validateImageDataUri) —
// no S3/disk needed, works on plain EC2. A higher size ceiling than photos
// since these are staff-uploaded documents, not something a phone camera
// produces casually — 5MB keeps a typical multi-page syllabus PDF well
// within MongoDB's 16MB document limit even after base64 overhead.
const MAX_PDF_BYTES = 5 * 1024 * 1024;
export function validatePdfDataUri(dataUri) {
  if (!dataUri || typeof dataUri !== "string")
    throw badRequest("No PDF file was provided.");
  const match = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUri.trim(),
  );
  if (!match) throw badRequest("Attachment must be a PDF file.");
  const approxBytes = Math.floor(match[1].length * 0.75);
  if (approxBytes > MAX_PDF_BYTES) {
    throw badRequest(
      `PDF is too large (max ${Math.floor(MAX_PDF_BYTES / 1024 / 1024)}MB). Please choose a smaller file.`,
    );
  }
  if (approxBytes < 50)
    throw badRequest("PDF file appears to be empty or corrupted.");
  return dataUri.trim();
}

const MAX_AVATAR_BYTES = 100 * 1024; // 100KB raw image, per product requirement
export function validateImageDataUri(dataUri) {
  if (!dataUri || typeof dataUri !== "string")
    throw badRequest("No image was provided.");
  const match =
    /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
      dataUri.trim(),
    );
  if (!match) throw badRequest("Image must be a JPEG, PNG, or WEBP file.");
  const base64 = match[2];
  const approxBytes = Math.floor(base64.length * 0.75);
  if (approxBytes > MAX_AVATAR_BYTES) {
    throw badRequest(
      `Image is too large (max ${Math.floor(MAX_AVATAR_BYTES / 1024)}KB). Please choose a smaller photo.`,
    );
  }
  if (approxBytes < 100)
    throw badRequest("Image file appears to be empty or corrupted.");
  return dataUri.trim();
}

// Spec item 3: Emergency Contact Number — required (when supplied in an
// update), must be a plausible mobile number. Kept intentionally permissive
// on formatting (spaces/dashes/+country code) since this is a real-world
// contact number field, not a strict E.164 validator.
export function validateMobileNumber(
  value,
  fieldLabel = "Emergency contact number",
) {
  const raw = String(value || "").trim();
  if (!raw) throw badRequest(`${fieldLabel} is required.`);
  const digits = raw.replace(/[\s\-()]/g, "");
  if (!/^\+?\d{10,15}$/.test(digits)) {
    throw badRequest(
      `${fieldLabel} must be a valid mobile number (10-15 digits).`,
    );
  }
  return raw;
}

// Spec: a department may have at most one Dept Admin (formerly "HOD") and
// one Co-Dept Admin (formerly "Co-HOD") at a time — used by both Admin's
// and Super Admin's "appoint" endpoints so the rule is enforced identically
// regardless of who's appointing. Internal role values stay 'hod'/'co_hod'
// (touching those would ripple through auth/permissions); only the
// display label changed.
export async function appointHod({ dept, role, user }) {
  if (!["hod", "co_hod"].includes(role))
    throw badRequest("Role must be either Dept Admin or Co-Dept Admin.");
  const slotField = role === "hod" ? "hod" : "coHod";
  const existingId = dept[slotField];
  if (existingId && String(existingId) !== String(user._id || user.id)) {
    const existing = await User.findOne({ _id: existingId, isDeleted: false })
      .select("name")
      .lean();
    if (existing) {
      throw badRequest(
        `This department already has a ${role === "hod" ? "Dept Admin" : "Co-Dept Admin"} (${existing.name}). Remove them first before appointing someone new.`,
      );
    }
  }
  dept[slotField] = user._id || user.id;
  await dept.save();
  return dept;
}

// Detach whichever slot (hod/coHod) a user occupies on a department — called
// when that HOD/Co-HOD account is deleted, so the department doesn't keep
// pointing at a soft-deleted user.
export async function detachHodFromDepartment(userId, by) {
  await Department.updateMany(
    { hod: userId },
    { $set: { hod: null, updatedBy: by } },
  );
  await Department.updateMany(
    { coHod: userId },
    { $set: { coHod: null, updatedBy: by } },
  );
}

export async function ensureUser(
  {
    name,
    email,
    role,
    college,
    department,
    phone,
    subject,
    course,
    designation,
    qualification,
    experience,
    emergencyContact,
  },
  by,
  options = {},
) {
  const normalized = String(email || "")
    .toLowerCase()
    .trim();
  if (!normalized)
    throw Object.assign(new Error("Email is required."), { status: 400 });
  let user = await User.findOne({ email: normalized }).select("+passwordHash");
  if (!user) {
    await ensureEmailAvailable(normalized, {
      excludeStudentId: options.excludeStudentId,
      allowParentReuse: role === "parent",
    });
    user = new User({ email: normalized, firstLogin: true, createdBy: by });
  } else if (!(role === "parent" && user.role === "parent")) {
    throw badRequest("This email is already registered.");
  }
  // Only update these fields if provided
  if (name) user.name = name;
  if (role) user.role = role;
  if (college) user.college = college;
  if (department !== undefined) user.department = department;
  if (phone) user.phone = phone;
  if (subject) user.subject = subject;
  if (course) user.course = course;
  if (designation) user.designation = designation;
  if (qualification) user.qualification = qualification;
  if (experience) user.experience = experience;
  if (emergencyContact) user.emergencyContact = emergencyContact;
  user.active = true;
  user.isDeleted = false;
  user.updatedBy = by;
  await user.save();
  return user;
}

export function mapStudent(s) {
  if (!s) return null;
  const o = s.toJSON ? s.toJSON() : { ...s };
  o.roll = o.roll || o.rollNo || o.rollNumber || "";
  o.rollNo = o.rollNo || o.roll || "";
  o.rollNumber = o.rollNumber || o.roll || o.rollNo || "";
  o.sem = o.sem || o.semester || 1;
  o.semester = o.semester || o.sem || 1;
  o.course = o.course || o.courseName || "";
  o.courseName = o.courseName || o.course;
  o.phone = o.phone || o.mobile || "";
  o.mobile = o.mobile || o.phone || "";
  o.active = o.active !== false && o.isActive !== false;
  o.isActive = o.active;
  if (typeof o.address === "object" && o.address) {
    o.street = o.street || o.address.street || "";
    o.city = o.city || o.address.city || "";
    o.state = o.state || o.address.state || "";
    o.pincode = o.pincode || o.address.pincode || "";
  }
  o.status = o.isDeleted
    ? "Deleted"
    : o.status || (o.active !== false ? "Active" : "Inactive");
  return o;
}

export function mapTeacher(t) {
  if (!t) return null;
  const o = t.toJSON ? t.toJSON() : { ...t };
  o.status = o.isDeleted
    ? "Deleted"
    : o.active !== false
      ? "Active"
      : "Inactive";
  // Always derive from role rather than trusting a possibly-stale stored
  // `designation` string — accounts appointed before the HOD→Dept Admin
  // rename still have "HOD"/"Co-HOD" saved in the DB.
  o.designation = ["hod", "co_hod"].includes(o.role)
    ? o.role === "co_hod"
      ? "Co-Dept Admin"
      : "Dept Admin"
    : o.role === "admin"
      ? "Principal"
      : o.designation || "Teacher";
  return o;
}

export async function collegeScope(user) {
  if (roleIs(user, "super_admin", "superadmin")) return {};
  return { college: user.college };
}

export async function departmentScope(user) {
  if (roleIs(user, "hod", "co_hod", "teacher"))
    return { college: user.college, department: user.department };
  return collegeScope(user);
}

export async function softDeleteMany(Model, filter, userId) {
  return Model.updateMany(filter, {
    $set: {
      isDeleted: true,
      active: false,
      deletedAt: new Date(),
      deletedBy: userId,
    },
  });
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export async function ensureEmailAvailable(
  email,
  { excludeUserId, excludeStudentId, allowParentReuse = false } = {},
) {
  const normalized = String(email || "")
    .toLowerCase()
    .trim();
  if (!normalized) return normalized;

  const userFilter = { email: normalized, isDeleted: false };
  if (excludeUserId) userFilter._id = { $ne: excludeUserId };
  const existingUser = await User.findOne(userFilter).select("role").lean();
  if (existingUser && !(allowParentReuse && existingUser.role === "parent")) {
    throw badRequest("This email is already registered.");
  }

  const studentFilter = { email: normalized, isDeleted: false };
  if (excludeStudentId) studentFilter._id = { $ne: excludeStudentId };
  const existingStudent = await Student.findOne(studentFilter)
    .select("_id")
    .lean();
  if (existingStudent) throw badRequest("This email is already registered.");

  return normalized;
}

// Spec item 1: Parent Email is mandatory, must be unique across students, and
// must differ from the student's own email. Enforced at the app layer (not a
// DB unique index) because this schema soft-deletes rather than removes rows —
// see the note on the Student model's parentEmail index.
export async function validateParentEmail({
  parentEmail,
  studentEmail,
  excludeStudentId,
}) {
  const email = String(parentEmail || "")
    .toLowerCase()
    .trim();
  if (!email) throw badRequest("Parent email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw badRequest("Parent email is not a valid email address.");
  if (studentEmail && email === String(studentEmail).toLowerCase().trim()) {
    throw badRequest("Parent email cannot be the same as the student email.");
  }
  // Parent emails ARE allowed to repeat across multiple students — one parent
  // can have more than one child in the system, sharing a single parent
  // login (see User.students). What's NOT allowed is reusing an email that
  // belongs to a completely different kind of account — a teacher, HOD,
  // admin, or a student's own login — since every other email in the system
  // must be used exactly once.
  await ensureEmailAvailable(email, { allowParentReuse: true });
  return email;
}

// Creates/updates the Parent login account for a student and keeps it pointed
// at the right email. If the student's parentEmail changed, the old parent
// account (if any) is detached from THIS student only (its other children,
// if any, are untouched) rather than deleted — nothing is destroyed, it just
// stops granting access to this particular student's data.
export async function syncParentAccount(student, by) {
  const newEmail = String(student.parentEmail || "")
    .toLowerCase()
    .trim();
  // Detach this student from any parent account that no longer matches
  // (but keep that parent account intact for their other children, if any).
  await User.updateMany(
    { role: "parent", students: student._id, email: { $ne: newEmail } },
    { $pull: { students: student._id }, $set: { updatedBy: by } },
  );
  // Legacy single-student field — clear it too if it pointed here.
  await User.updateMany(
    { role: "parent", student: student._id, email: { $ne: newEmail } },
    { $unset: { student: 1 }, $set: { updatedBy: by } },
  );
  if (!newEmail) return null;
  const parent = await ensureUser(
    {
      name: `Parent of ${student.name}`,
      email: newEmail,
      role: "parent",
      college: student.college,
      department: student.department,
    },
    by,
  );
  // Add this student to the parent's children list if not already there —
  // this is what lets one parent email cover more than one child.
  if (!parent.students?.some((s) => String(s) === String(student._id))) {
    parent.students = [...(parent.students || []), student._id];
  }
  if (!parent.student) parent.student = student._id; // keep legacy field populated too
  await parent.save();
  return parent;
}

export async function createStudent(payload, user, options = {}) {
  const { requireParentEmail = true, requireStudentEmail = false } = options;
  const roll = payload.roll || payload.rollNo || payload.rollNumber;
  if (!roll) throw badRequest("Roll number is required.");
  if (requireStudentEmail && !String(payload.email || "").trim()) {
    throw badRequest("Student email is required.");
  }
  const isDepartmentRole = roleIs(user, "hod", "co_hod", "teacher");
  const dept = isDepartmentRole
    ? user.department
    : payload.department || payload.departmentId || user.department;
  const col = isDepartmentRole ? user.college : payload.college || user.college;
  if (!col || !dept)
    throw Object.assign(new Error("College and department are required."), {
      status: 400,
    });

  const course = payload.course || payload.courseName;
  if (!course)
    throw badRequest(
      "Course is required — a student must be assigned to a specific course.",
    );
  const semester = Number(payload.semester || payload.sem || 1);

  // Spec item 9: no duplicate student records — a roll number must be unique
  // within its own class (college + department + course + semester).
  const dupRoll = await Student.findOne({
    college: col,
    department: dept,
    course,
    semester,
    ...live,
    roll: new RegExp(
      `^${String(roll)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i",
    ),
  })
    .select("_id")
    .lean();
  if (dupRoll)
    throw badRequest(
      `Roll number "${roll}" is already in use in ${course} Semester ${semester}.`,
    );

  // Parent email is mandatory when a HOD/Admin adds one student by hand
  // (there's a form right there to fill it in). Bulk Excel import is more
  // forgiving — a missing parent email just means no parent account gets
  // created yet; HOD can add it later from the student's Details modal,
  // which creates the parent account at that point (see
  // updateStudentAndSyncParent). This is what actually let every row in an
  // import silently fail before — every row was rejected for a column the
  // import form doesn't even collect, with the failure hidden by the
  // per-row try/catch in the import route.
  let parentEmail;
  if (requireParentEmail || payload.parentEmail) {
    parentEmail = await validateParentEmail({
      parentEmail: payload.parentEmail,
      studentEmail: payload.email,
    });
  } else {
    parentEmail = undefined;
  }

  const studentEmail = payload.email
    ? await ensureEmailAvailable(payload.email)
    : "";

  const address =
    typeof payload.address === "object" && payload.address
      ? payload.address
      : {
          street: payload.street || payload.address || "",
          city: payload.city || "",
          state: payload.state || "",
          pincode: payload.pincode || "",
        };

  const student = await Student.create({
    ...payload,
    email: studentEmail || payload.email,
    roll,
    rollNo: roll,
    rollNumber: roll,
    parentEmail,
    phone: payload.phone || payload.mobile || "",
    mobile: payload.mobile || payload.phone || "",
    course,
    courseName: payload.courseName || course,
    semester,
    sem: semester,
    address,
    city: payload.city || address.city || "",
    college: col,
    department: dept,
    createdBy: user.id || user._id,
  });

  await syncParentAccount(student, user.id || user._id);

  if (studentEmail) {
    const account = await ensureUser(
      {
        name: payload.name,
        email: studentEmail,
        role: "student",
        college: student.college,
        department: student.department,
        phone: payload.phone,
      },
      user.id || user._id,
      { excludeStudentId: student._id },
    );
    student.user = account.id;
    account.student = student.id;
    await Promise.all([account.save(), student.save()]);
  }
  return student;
}

// Shared by HOD's and Admin's PUT /students/:id — validates & syncs the
// parent account only when parentEmail is actually part of the update, so
// routine edits (e.g. just changing a phone number) aren't forced to re-supply it.
export async function updateStudentAndSyncParent(filter, rawBody, by) {
  const existing = await Student.findOne(filter);
  if (!existing) return null;
  const body = { ...rawBody, updatedBy: by };
  if ("email" in body) {
    body.email = await ensureEmailAvailable(body.email, {
      excludeStudentId: existing._id,
      excludeUserId: existing.user,
    });
  }
  if ("parentEmail" in body) {
    body.parentEmail = await validateParentEmail({
      parentEmail: body.parentEmail,
      studentEmail: body.email || existing.email,
      excludeStudentId: existing._id,
    });
  }
  const student = await Student.findOneAndUpdate(filter, body, { new: true });
  if (student && "parentEmail" in body) {
    await syncParentAccount(student, by);
  }
  return student;
}

const defaultScheduleTimes = [
  ["09:00", "10:15"],
  ["10:30", "11:45"],
  ["12:00", "13:15"],
  ["14:00", "15:15"],
  ["15:30", "16:30"],
  ["16:30", "17:30"],
];

function displayTime(startTime, endTime) {
  const to12 = (value) => {
    if (!value || !value.includes(":")) return value || "";
    let [hour, minute] = value.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
  };
  return `${to12(startTime)}${endTime ? " - " + to12(endTime) : ""}`;
}

export async function normalizeSubjectPayload(payload, user) {
  const body = { ...payload };
  const dept = body.departmentId || body.department || user.department;
  let courseValue = body.courseName || body.course;

  if (courseValue) {
    const courseOr = [{ name: courseValue }, { code: courseValue }];
    if (mongoose.Types.ObjectId.isValid(courseValue))
      courseOr.unshift({ _id: courseValue });
    const courseDoc = await Course.findOne({
      college: user.college,
      $or: courseOr,
      ...(dept ? { department: dept } : {}),
    }).lean();
    if (courseDoc) {
      courseValue = courseDoc.name;
      body.courseId = courseDoc._id;
      body.totalSems = courseDoc.totalSems;
    }
  }

  if (!courseValue)
    throw badRequest(
      "Course is required — a subject must belong to a specific course.",
    );
  body.course = courseValue;
  body.department = dept;
  body.semester = Number(body.semester || body.sem || 1);
  delete body.departmentId;
  return body;
}

export async function syncSubjectSchedule(subject, user) {
  if (!subject || subject.isDeleted) return null;
  const course = subject.course;
  if (!course) return null; // no real course on this subject — nothing to sync
  const semester = Number(subject.semester || subject.sem || 1);
  const existing = await Schedule.findOne({
    college: subject.college,
    department: subject.department,
    course,
    semester,
    $or: [{ subject: subject._id }, { subjectName: subject.name }],
    ...live,
  });

  const subjectCount = await Subject.countDocuments({
    college: subject.college,
    department: subject.department,
    course,
    semester,
    ...live,
  });
  const idx = Math.max(0, subjectCount - 1) % defaultScheduleTimes.length;
  const [startTime, endTime] = existing
    ? [existing.startTime, existing.endTime]
    : defaultScheduleTimes[idx];
  const day = existing?.day || "Mon";

  const teacher = subject.teacher
    ? await User.findById(subject.teacher).select("name").lean()
    : null;

  const update = {
    day,
    startTime,
    endTime,
    time: displayTime(startTime, endTime),
    subjectName: subject.name,
    subject: subject._id,
    teacherName: teacher?.name || existing?.teacherName || "",
    teacher: subject.teacher || existing?.teacher || null,
    room: existing?.room || "",
    type: subject.type || existing?.type || "Lecture",
    course,
    semester,
    college: subject.college,
    department: subject.department,
    active: true,
    isDeleted: false,
    updatedBy: user.id || user._id,
  };

  return Schedule.findOneAndUpdate(
    {
      college: subject.college,
      department: subject.department,
      course,
      semester,
      $or: [{ subject: subject._id }, { subjectName: subject.name }],
    },
    { $set: update, $setOnInsert: { createdBy: user.id || user._id } },
    { upsert: true, new: true },
  );
}

// ── Timetable: subject-locking & conflict detection ─────────────────────────
// These helpers back spec requirements:
//   5. Subjects must always come from the Admin-created master Subject list —
//      HOD/Teacher can never free-type a subject into a schedule or attendance record.
//   6. No two lectures may overlap for the same class, and no teacher may be
//      double-booked across overlapping time slots on the same day.

// Convert "HH:MM" (24h) to minutes-since-midnight for range comparisons.
function toMinutes(t) {
  if (!t || typeof t !== "string" || !t.includes(":")) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function timesOverlap(aStart, aEnd, bStart, bEnd) {
  const as = toMinutes(aStart),
    ae = toMinutes(aEnd);
  const bs = toMinutes(bStart),
    be = toMinutes(bEnd);
  if (as == null || bs == null) return false;
  const aEndEff = ae != null ? ae : as + 1;
  const bEndEff = be != null ? be : bs + 1;
  return as < bEndEff && bs < aEndEff;
}

/**
 * MINIMUM_LECTURE_DURATION_MINUTES
 * ----------------------------------
 * The shortest a single lecture/attendance session is allowed to be. Kept
 * as a named constant (rather than a bare "30" scattered through the code)
 * so the rule is documented in one obvious place and easy to change later
 * if the college's policy ever changes.
 */
export const MINIMUM_LECTURE_DURATION_MINUTES = 30;

/**
 * validateLectureDuration()
 * ---------------------------
 * Checks that a lecture's end time is at least MINIMUM_LECTURE_DURATION_MINUTES
 * after its start time. Used everywhere a lecture time range is created or
 * edited — the weekly Schedule builder, the "Add Lecture" form on Teacher
 * Details, and attendance marking — so the same 30-minute rule is enforced
 * consistently no matter which screen someone used.
 *
 * WHY THIS FUNCTION EXISTS:
 * Without a minimum duration, someone could accidentally (or mistakenly)
 * create a lecture that starts and ends at the same time, or one that ends
 * before it starts, which would be meaningless data — attendance for a
 * "lecture" that lasted zero minutes doesn't make sense.
 *
 * @param {string} startTime - Lecture start time, 24-hour "HH:MM" format (e.g. "11:00").
 * @param {string} endTime - Lecture end time, 24-hour "HH:MM" format (e.g. "11:30").
 * @returns {{ok: true} | {ok: false, message: string}} Either a success flag,
 *   or a failure flag with a human-readable reason to show the user.
 *
 * If this function were removed, nothing would stop a lecture with an
 * end time before (or equal to) its start time from being saved.
 */
export function validateLectureDuration(startTime, endTime) {
  const startInMinutes = toMinutes(startTime);
  const endInMinutes = toMinutes(endTime);

  if (startInMinutes == null || endInMinutes == null) {
    return { ok: false, message: "Start time and end time are both required." };
  }

  const durationInMinutes = endInMinutes - startInMinutes;

  if (durationInMinutes <= 0) {
    return { ok: false, message: "End time must be after start time." };
  }

  if (durationInMinutes < MINIMUM_LECTURE_DURATION_MINUTES) {
    return {
      ok: false,
      message: `A lecture must be at least ${MINIMUM_LECTURE_DURATION_MINUTES} minutes long.`,
    };
  }

  return { ok: true };
}

/**
 * validateAttendanceDateIsNotInTheFuture()
 * -------------------------------------------
 * Checks that a given date is today or earlier — never a date that hasn't
 * happened yet. Attendance can only be taken for a lecture that has
 * already occurred, so marking attendance for tomorrow (or any future
 * date) would always be a mistake.
 *
 * @param {string|Date} dateToCheck - The date the teacher/HOD is trying to mark attendance for.
 * @returns {{ok: true} | {ok: false, message: string}}
 *
 * If this function were removed, a teacher could accidentally mark a
 * student absent for a lecture that hasn't happened yet, which would be
 * meaningless (and confusing) attendance data.
 */
export function validateAttendanceDateIsNotInTheFuture(dateToCheck) {
  const parsedDate = new Date(dateToCheck);
  if (Number.isNaN(parsedDate.getTime())) {
    return { ok: false, message: "That date is not valid." };
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999); // end of today — so "today" itself is always allowed

  if (parsedDate.getTime() > today.getTime()) {
    return {
      ok: false,
      message:
        "Attendance cannot be marked for a future date. Please choose today or an earlier date.",
    };
  }

  return { ok: true };
}

// Resolve a schedule slot's subject strictly against the Admin-created master
// Subject list. Never creates a subject — throws if no match is found, so a
// HOD/Teacher can never introduce a subject that Admin hasn't defined.
export async function resolveSubjectForSlot({
  college,
  department,
  course,
  semester,
  subjectId,
  subjectName,
}) {
  let subject = null;
  if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
    subject = await Subject.findOne({
      _id: subjectId,
      college,
      department,
      ...live,
    });
  }
  if (!subject && subjectName) {
    subject = await Subject.findOne({
      college,
      department,
      ...live,
      name: new RegExp(
        `^${String(subjectName)
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i",
      ),
      $or: [{ course }, { course: { $exists: false } }],
    });
  }
  if (!subject) {
    throw Object.assign(
      new Error(
        `"${subjectName || subjectId || "Subject"}" is not in the Admin-created subject list for this course/semester. Ask Admin to add it first.`,
      ),
      { status: 400 },
    );
  }
  return subject;
}

// Look for a conflicting Schedule slot. Checks two things:
//   (a) class conflict — the same college/department/course/semester/day already
//       has an overlapping lecture (any teacher).
//   (b) teacher conflict — the given teacher already has an overlapping lecture
//       on that day, in any class.
// Returns a descriptive object if a conflict exists, otherwise null.
export async function findConflictingSlot({
  college,
  department,
  course,
  semester,
  day,
  startTime,
  endTime,
  teacher,
  excludeId,
}) {
  const baseFilter = {
    college,
    ...live,
    day,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  };

  const classSlots = await Schedule.find({
    ...baseFilter,
    department,
    course,
    semester,
  })
    .populate("teacher", "name")
    .lean();
  for (const slot of classSlots) {
    if (timesOverlap(startTime, endTime, slot.startTime, slot.endTime)) {
      return {
        type: "class",
        message: `This class already has a lecture scheduled during this time by ${slot.teacher?.name || slot.teacherName || "another teacher"}.`,
      };
    }
  }

  if (teacher) {
    const teacherSlots = await Schedule.find({ ...baseFilter, teacher }).lean();
    for (const slot of teacherSlots) {
      if (timesOverlap(startTime, endTime, slot.startTime, slot.endTime)) {
        return {
          type: "teacher",
          message: `This teacher already has a lecture scheduled during this time (${slot.course || ""} Sem ${slot.semester || ""}).`,
        };
      }
    }
  }

  return null;
}

// Roll-number range helper (Practical/Lab batching). Mirrors the numeric-
// aware comparison used elsewhere (student.routes.js's local rollInRange) so
// "1".."21" compares numerically rather than lexicographically (which would
// wrongly put "2" after "10").
export function isRollWithinRange(roll, start, end) {
  if (!start && !end) return true; // no range given = whole class
  const value = String(roll || "").trim();
  const from = String(start || "").trim();
  const to = String(end || "").trim();
  if (!value || !from || !to) return false;
  if (/^\d+$/.test(value) && /^\d+$/.test(from) && /^\d+$/.test(to)) {
    const n = BigInt(value),
      a = BigInt(from),
      b = BigInt(to);
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

// Do two roll-number ranges intersect? A missing/empty range on either side
// (or an explicit "all students" session) is treated as covering the WHOLE
// class, so it overlaps with everything — this preserves the original
// behaviour for Theory/Tutorial/Seminar sessions that never had a roll range.
export function rollRangesOverlap(aStart, aEnd, bStart, bEnd) {
  const a1 = String(aStart || "").trim(),
    a2 = String(aEnd || "").trim();
  const b1 = String(bStart || "").trim(),
    b2 = String(bEnd || "").trim();
  if (!a1 || !a2 || !b1 || !b2) return true; // one side is "all students"
  if (
    /^\d+$/.test(a1) &&
    /^\d+$/.test(a2) &&
    /^\d+$/.test(b1) &&
    /^\d+$/.test(b2)
  ) {
    const aLo = BigInt(a1) < BigInt(a2) ? BigInt(a1) : BigInt(a2);
    const aHi = aLo === BigInt(a1) ? BigInt(a2) : BigInt(a1);
    const bLo = BigInt(b1) < BigInt(b2) ? BigInt(b1) : BigInt(b2);
    const bHi = bLo === BigInt(b1) ? BigInt(b2) : BigInt(b1);
    return aLo <= bHi && bLo <= aHi;
  }
  const cmp = (x, y) => x.localeCompare(y, undefined, { numeric: true });
  const aLo = cmp(a1, a2) <= 0 ? a1 : a2,
    aHi = aLo === a1 ? a2 : a1;
  const bLo = cmp(b1, b2) <= 0 ? b1 : b2,
    bHi = bLo === b1 ? b2 : b1;
  return cmp(aLo, bHi) <= 0 && cmp(bLo, aHi) <= 0;
}

// Spec: attendance marking must respect the same "no overlapping lecture for
// this class" rule as the timetable itself — if Teacher A already marked
// attendance for BCA Sem 2 Division A from 10:00-11:00, Teacher B cannot mark
// attendance for any overlapping window (10:15-12:15, or anything touching
// that range) for the same class/day, regardless of subject. This checks the
// actual Attendance records submitted, not just the Schedule, since a
// teacher's marking form takes a free-typed time that isn't required to
// exactly match a Schedule slot.
//
// Practical/Lab exception: if BOTH the new submission and an existing one
// are scoped to a specific, non-overlapping roll-number batch (e.g. 1-21 vs
// 22-45) — rather than the whole class — they are different physical lab
// groups meeting at the same time and are allowed to coexist. Any session
// marked "All Students" (or with no roll range at all, e.g. every Theory
// lecture) still conflicts with anything overlapping it in time, exactly as
// before.
export async function findAttendanceTimeConflict({
  college,
  department,
  course,
  semester,
  division,
  day,
  date,
  startTime,
  endTime,
  excludeTeacher,
  rollRangeStart,
  rollRangeEnd,
  allStudents,
}) {
  if (!startTime || !endTime) return null; // nothing to compare against
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const candidates = await Attendance.find({
    college,
    department,
    course,
    semester,
    ...live,
    division: division || "",
    date: { $gte: dayStart, $lte: dayEnd },
    ...(excludeTeacher ? { teacher: { $ne: excludeTeacher } } : {}),
  })
    .populate("teacher", "name")
    .select("time teacher subjectName allStudents rollRangeStart rollRangeEnd")
    .lean();

  // "Whole class" = explicitly flagged allStudents, OR no roll range given at
  // all (every pre-existing record, and every non-Practical type, has no
  // roll range — so it always behaves as "whole class", same as before).
  const requestWholeClass =
    allStudents === true || !(rollRangeStart && rollRangeEnd);

  for (const c of candidates) {
    if (!c.time) continue;
    const [cStart, cEnd] = String(c.time).split(/\s*[-–]\s*/);
    if (!timesOverlap(startTime, endTime, cStart, cEnd)) continue;

    const candidateIsWhole =
      c.allStudents === true || !(c.rollRangeStart && c.rollRangeEnd);

    if (requestWholeClass || candidateIsWhole) {
      return {
        message: `${c.teacher?.name || "Another teacher"} already has attendance marked for this class from ${cStart} to ${cEnd || ""}. No lecture may overlap another for the same class.`,
      };
    }
    if (
      rollRangesOverlap(
        rollRangeStart,
        rollRangeEnd,
        c.rollRangeStart,
        c.rollRangeEnd,
      )
    ) {
      return {
        message: `${c.teacher?.name || "Another teacher"} already has attendance marked for roll ${c.rollRangeStart}-${c.rollRangeEnd} from ${cStart} to ${cEnd || ""}, which overlaps the roll range you selected.`,
      };
    }
  }
  return null;
}

export async function collegeSummary(collegeId) {
  const [departments, students, teachers, principals] = await Promise.all([
    Department.countDocuments({ college: collegeId, ...live }),
    Student.countDocuments({ college: collegeId, ...live }),
    User.countDocuments({
      college: collegeId,
      role: { $in: ["teacher", "hod", "co_hod"] },
      ...live,
    }),
    User.countDocuments({
      college: collegeId,
      role: { $in: ["admin", "principal"] },
      ...live,
    }),
  ]);
  return {
    departments,
    students,
    teachers,
    principals,
    totalPeople: students + teachers + principals,
  };
}

export async function adminOverview(user) {
  const scope = await collegeScope(user);
  const [departments, students, teachers, notices, hods] = await Promise.all([
    Department.countDocuments({ ...scope, ...live }),
    Student.countDocuments({ ...scope, ...live }),
    User.countDocuments({ ...scope, role: "teacher", ...live }),
    Notice.countDocuments({ ...scope, ...live }),
    User.countDocuments({
      ...scope,
      role: { $in: ["hod", "co_hod"] },
      ...live,
    }),
  ]);
  return {
    departments,
    students,
    teachers,
    hods,
    notices,
    users: teachers + students + hods,
  };
}

export async function studentBundle(student) {
  const course = student.course || student.courseName;
  const semester = Number(student.semester || student.sem || 0);
  const filter = {
    college: student.college,
    department: student.department,
    ...live,
  };
  const classFilter = {
    ...filter,
    ...(course ? { course } : {}),
    ...(semester ? { semester } : {}),
  };
  const [subjects, notices, marks, timetable, syllabus, attendance] =
    await Promise.all([
      Subject.find(classFilter).lean(),
      Notice.find({
        college: student.college,
        ...live,
        $and: [
          {
            $or: [
              { department: student.department },
              { department: null },
              { department: { $exists: false } },
            ],
          },
          {
            $or: [
              { course: { $in: [null, undefined, ""] } },
              {
                course: student.course,
                semester: Number(student.semester || student.sem || 0),
              },
            ],
          },
          {
            $or: [
              { targetRole: "all" },
              { targetRole: { $exists: false } },
              { targetRole: "student" },
            ],
          },
        ],
      })
        .sort({ createdAt: -1 })
        .populate("author", "name")
        .populate("createdBy", "name")
        .lean(),
      Mark.find({
        student: student._id || student.id,
        ...live,
        // A student sees a mark once the teacher/CC has published it, OR
        // immediately if it has their own self-uploaded marksheet screenshot
        // attached (that's their own submission, not a result being withheld).
        // Keyed on `image` presence (only ever set by the student's own
        // upload route) rather than `enteredBy`, so a screenshot uploaded
        // alongside an existing-but-unpublished teacher-entered number can't
        // accidentally leak that number early.
        $or: [
          { published: true },
          { image: { $exists: true, $nin: ["", null] } },
        ],
      })
        .populate("subject", "name code")
        .lean(),
      Schedule.find(classFilter).lean(),
      Syllabus.find(classFilter).lean(),
      Attendance.find({ student: student._id || student.id, ...live })
        .populate("subject", "name code")
        .populate("teacher", "name")
        .lean(),
    ]);
  return { subjects, notices, marks, timetable, syllabus, attendance };
}

export async function hashDeletionPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function compareDeletionPassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

// src/utils/hardDelete.js
//
// Spec item 5: "no soft delete — hard delete only." Deleting a record now
// genuinely removes it from the database, rather than flipping an
// `isDeleted` flag. This file is the single place that knows what else in
// the system needs cleaning up when each type of record disappears, so a
// delete never leaves a dangling reference behind (an orphaned Subject
// pointing at a Teacher who no longer exists, a parent account still linked
// to a Student that's gone, etc).
//
// Usage: fetch the document as normal, then:
//   await hardDeleteCascade(doc, req.user);
// instead of the old `await softDelete(doc, req.user.id)`.
//
// After this runs, the record is truly gone — e.g. a deleted student's
// email is genuinely no longer registered, so their next login attempt
// correctly fails with "not registered" (see auth.controller.js), and that
// same email becomes free to use again for a new person.

import User from '../models/User.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';
import Schedule from '../models/Schedule.js';
import Syllabus from '../models/Syllabus.js';
import Attendance from '../models/Attendance.js';
import Mark from '../models/Mark.js';
import Notice from '../models/Notice.js';
import Department from '../models/Department.js';
import Course from '../models/Course.js';

export async function hardDeleteCascade(doc, actorUser) {
  if (!doc) return;
  const modelName = doc.constructor?.modelName;

  switch (modelName) {
    case 'User': {
      // Teacher / HOD / Co-HOD accounts can be assigned all over the place —
      // unassign them everywhere rather than deleting the things they were
      // assigned to (a Subject or Schedule slot should simply become
      // unassigned, not vanish, when its teacher is removed).
      await Subject.updateMany({ teacher: doc._id }, { $unset: { teacher: 1 }, $set: { updatedBy: actorUser?.id } });
      await Schedule.updateMany({ teacher: doc._id }, { $unset: { teacher: 1 }, $set: { updatedBy: actorUser?.id } });
      await Department.updateMany({ hod: doc._id }, { $unset: { hod: 1 } });
      await Department.updateMany({ coHod: doc._id }, { $unset: { coHod: 1 } });
      // A deleted teacher who was a Co-HOD stepping down — their activity
      // history log (see coHodActivity.js) is left in place intentionally,
      // as a historical record for the department, same as meeting minutes
      // don't get erased when someone leaves a company.
      if (doc.role === 'student') {
        // A User account of role 'student' is a login shell for a Student
        // document — remove the link so nothing points at a dangling user.
        await Student.updateMany({ user: doc._id }, { $unset: { user: 1 } });
      }
      if (doc.role === 'parent') {
        // Nothing to cascade — the linked Student record(s) are untouched,
        // they simply lose this parent login. If a new parent account is
        // created later with the same email, it starts fresh.
      }
      break;
    }

    case 'Student': {
      // The student's own login (if they had one) goes with them.
      if (doc.user) await User.deleteOne({ _id: doc.user, role: 'student' });
      await User.deleteMany({ role: 'student', student: doc._id });
      // Detach (not delete) any parent account — a parent may have other
      // children still in the system sharing that same login.
      await User.updateMany({ role: 'parent', students: doc._id }, { $pull: { students: doc._id } });
      await User.updateMany({ role: 'parent', student: doc._id }, { $unset: { student: 1 } });
      // This student's own historical records go with them.
      await Attendance.deleteMany({ student: doc._id });
      await Mark.deleteMany({ student: doc._id });
      break;
    }

    case 'Subject': {
      await Schedule.deleteMany({ subject: doc._id });
      await Syllabus.deleteMany({ subject: doc._id });
      break;
    }

    case 'Department': {
      // Departments are rarely deleted (only once truly empty, in practice)
      // but if it happens, nothing should still claim to belong to it.
      // Course.department is a required field, so those go too rather than
      // being left dangling; Subjects likewise. Students/Teachers already
      // in this department keep their own records — an admin who wants
      // those gone too deletes them individually first.
      await Subject.deleteMany({ department: doc._id });
      await Course.deleteMany({ department: doc._id });
      break;
    }

    case 'Course': {
      // Subjects/Students referencing this course by name are left alone —
      // `course` is stored as a plain name string elsewhere in the system,
      // not a hard reference, so removing the Course record doesn't orphan
      // anything structurally; it just stops appearing in course pickers.
      break;
    }

    case 'College': {
      // The most destructive delete in the system — wipes everything that
      // belongs to this college. Already gated behind a deletion password
      // check in super.routes.js before this ever runs.
      const deptIds = (await Department.find({ college: doc._id }).select('_id').lean()).map(d => d._id);
      await Promise.all([
        Student.deleteMany({ college: doc._id }),
        User.deleteMany({ college: doc._id }),
        Subject.deleteMany({ college: doc._id }),
        Course.deleteMany({ college: doc._id }),
        Schedule.deleteMany({ college: doc._id }),
        Syllabus.deleteMany({ college: doc._id }),
        Attendance.deleteMany({ college: doc._id }),
        Mark.deleteMany({ college: doc._id }),
        Notice.deleteMany({ college: doc._id }),
        Department.deleteMany({ _id: { $in: deptIds } }),
      ]);
      break;
    }

    // Notice, Schedule, Mark, Syllabus, College — no further cascade needed;
    // nothing else in the system holds a reference *into* these.
    default:
      break;
  }

  await doc.deleteOne();
}

/**
 * hardDeleteManyCascade()
 * For routes that currently bulk-delete with softDeleteMany(Model, filter).
 * Loads each matching doc (so cascade logic still runs per-record) then
 * removes them. Slightly more work than a single deleteMany, but correctness
 * of the cascade matters more than raw speed for an admin bulk-delete action.
 */
export async function hardDeleteManyCascade(Model, filter, actorUser) {
  const docs = await Model.find(filter);
  let count = 0;
  for (const doc of docs) {
    await hardDeleteCascade(doc, actorUser);
    count++;
  }
  return count;
}

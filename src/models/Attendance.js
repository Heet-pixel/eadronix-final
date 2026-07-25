/**
 * SAL Portal – Attendance Model
 * File: src/models/Attendance.js
 *
 * Changes from original:
 *  5. Database Indexes – added indexes for common query patterns:
 *       • student    – lookup all attendance records for a student
 *       • teacher    – lookup records created by a teacher
 *       • date       – range queries (date between X and Y)
 *       • isDeleted  – soft-delete filter (from baseFields)
 *       • Compound (student, date) – "student's attendance on a date"
 *       • Compound (college, department, semester, date) – HOD attendance
 *         report query: "all records for dept X, sem Y, on date Z"
 *       • Compound (teacher, date) – teacher's daily attendance entry lookup
 *
 *  8. Performance – added sparse index on `subject` so null values don't
 *     bloat the index (subject is optional in some records).
 */

import mongoose from 'mongoose';
import { baseFields, toJSON } from './BaseFields.js';

const AttendanceSchema = new mongoose.Schema(
  {
    date:        { type: Date, default: Date.now },
    subject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    subjectName: String,
    teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    student:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    status:      { type: String, enum: ['present', 'absent', 'leave'], default: 'present' },
    course:      String,
    semester:    Number,
    // Spec item 4 (Attendance History / Edit): these three fields, together
    // with date/course/semester/subject/teacher, identify "one lecture" so a
    // past submission can be edited in place instead of creating a new one.
    division:    { type: String, default: '' },
    type:        { type: String, default: 'Lecture' },
    time:        { type: String, default: '' }, // e.g. "09:00 - 10:00", captured at marking time
    topic:       { type: String, default: '' },
    isProxy:     { type: Boolean, default: false },
    proxyForSubject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    proxyForSubjectName: { type: String, default: '' },
    college:     { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    department:  { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Single-field indexes
AttendanceSchema.index({ student:    1 });
AttendanceSchema.index({ teacher:    1 });
AttendanceSchema.index({ date:       1 });
AttendanceSchema.index({ college:    1 });
AttendanceSchema.index({ department: 1 });
// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)

// Sparse on optional FK
AttendanceSchema.index({ subject: 1 }, { sparse: true });

// Compound: student attendance history (most common student-portal query)
AttendanceSchema.index({ student: 1, date: -1 });

// Compound: teacher's daily entry
AttendanceSchema.index({ teacher: 1, date: -1 });

// Compound: grouping records into "lecture sessions" for Attendance History (spec item 4)
AttendanceSchema.index({ teacher: 1, course: 1, semester: 1, subject: 1, date: -1 });

// Compound: HOD / admin report queries
AttendanceSchema.index({ college: 1, department: 1, semester: 1, date: -1 });

toJSON(AttendanceSchema);
export default mongoose.model('Attendance', AttendanceSchema);

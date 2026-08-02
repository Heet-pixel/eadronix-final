/**
 * SAL Portal – Mark Model
 * File: src/models/Mark.js
 *
 * Changes from original:
 *  5. Database Indexes – added indexes for performance:
 *       • student    – look up all marks for a student
 *       • subject    – look up marks for a subject
 *       • college    – college-scoped queries
 *       • department – department-scoped queries
 *       • examType   – filter by exam type (UT1, UT2, Final, etc.)
 *       • isDeleted  – soft-delete filter
 *       • Compound (student, subject, examType) – unique mark lookup
 *         (a student has exactly one mark per subject per exam type)
 *       • Compound (college, department) – admin/HOD result reports
 */

import mongoose from 'mongoose';
import { baseFields, toJSON } from './BaseFields.js';

const MarkSchema = new mongoose.Schema(
  {
    student:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    subject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    subjectName: String,
    examType:    String,
    marks:       Number,
    maxMarks:    { type: Number, default: 100 },
    college:     { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    department:  { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

    // ── Class Coordinator marks-sheet feature ──────────────────────────────
    // `image`: a GridFS/S3-backed URL (see utils/gridfs.js storeDataUri) — a
    // screenshot of the student's own marksheet, uploaded by the STUDENT
    // themselves as an alternative/supplement to a teacher typing a number.
    image:          { type: String, default: '' },
    imageUploadedAt: Date,
    // Who actually put the value in this row: the teacher/CC typed a number,
    // or the student self-reported by uploading a screenshot.
    enteredBy:      { type: String, enum: ['teacher', 'student'], default: 'teacher' },
    // `published`: the CC/teacher's "send marks to student" toggle. Teacher-
    // entered numeric marks stay hidden from the student's own marks view
    // until this is true. A student's OWN self-uploaded image is always
    // visible to that student regardless of this flag (see studentBundle()
    // in controllers/common.js) — it's their own upload, not a result being
    // withheld from them.
    published:      { type: Boolean, default: false },
    publishedAt:    Date,
    publishedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Single-field indexes
MarkSchema.index({ student:    1 });
MarkSchema.index({ subject:    1 });
MarkSchema.index({ college:    1 });
MarkSchema.index({ department: 1 });
MarkSchema.index({ examType:   1 });
// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)

// Compound: logical unique mark record
MarkSchema.index({ student: 1, subject: 1, examType: 1 });

// Compound: result report for a department
MarkSchema.index({ college: 1, department: 1 });

toJSON(MarkSchema);
export default mongoose.model('Mark', MarkSchema);

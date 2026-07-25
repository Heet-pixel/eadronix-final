/**
 * SAL Portal – Notice Model
 * File: src/models/Notice.js
 *
 * Changes from original:
 *  5. Database Indexes – added/confirmed indexes:
 *       • college    – already inline-indexed, confirmed
 *       • department – already inline-indexed, confirmed
 *       • targetRole – filter notices by audience role
 *       • isDeleted  – soft-delete filter
 *       • createdAt  – sort newest-first (most common display order)
 *       • Compound (college, targetRole, isDeleted) – dashboard notice feed
 *         query: "active notices for role X in college Y"
 */

import mongoose from 'mongoose';
import { baseFields, toJSON } from './BaseFields.js';

const NoticeSchema = new mongoose.Schema(
  {
    title:      { type: String, required: true },
    body:       String,
    message:    String,
    priority:   { type: String, default: 'normal' },
    targetRole: { type: String, default: 'all' },
    // Spec: student's Notices feed distinguishes where something came from —
    // Teacher's "Upload Syllabus", HOD's "Announcements", Admin's "New Notice".
    sourceType: { type: String, enum: ['notice', 'announcement', 'syllabus'], default: 'notice' },
    // Optional targeting: if set, only students in this exact course+semester
    // see it. If left unset, it's visible to the whole department/college as before.
    course:     String,
    semester:   Number,
    // Optional: when targetRole is 'teacher' and the HOD ticked specific
    // teachers (rather than "Select All"), only those teachers should see
    // this notice. Empty/absent = every teacher in the department.
    targetTeacherIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Optional PDF attachment (data URI, e.g. a syllabus document) — students
    // can view/download it. See controllers/common.js#validatePdfDataUri.
    attachment: String,
    attachmentName: String,
    college:    { type: mongoose.Schema.Types.ObjectId, ref: 'College',    index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    author:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

NoticeSchema.index({ targetRole: 1 });
// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)
NoticeSchema.index({ createdAt: -1 });

// Compound: notice feed for a college + role (the most common query)
NoticeSchema.index({ college: 1, targetRole: 1, isDeleted: 1 });

// Compound: department-scoped notice feed
NoticeSchema.index({ department: 1, isDeleted: 1 });

// Compound: course+semester-targeted notice feed (student's dashboard)
NoticeSchema.index({ college: 1, course: 1, semester: 1, isDeleted: 1 });

toJSON(NoticeSchema);
export default mongoose.model('Notice', NoticeSchema);

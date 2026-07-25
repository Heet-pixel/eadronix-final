/**
 * SAL Portal – Subject Model
 * File: src/models/Subject.js
 *
 * Changes from original:
 *  5. Database Indexes – added:
 *       • college    – already inline-indexed, confirmed
 *       • department – already inline-indexed, confirmed
 *       • teacher    – reverse-lookup "subjects assigned to teacher X"
 *       • course     – filter by course string
 *       • semester   – filter by semester
 *       • isDeleted  – soft-delete filter
 *       • Compound (college, department, semester) – timetable / syllabus query
 *       • Compound (department, course, semester) – subject list for a specific
 *         course-semester (most common HOD query)
 */

import mongoose from 'mongoose';
import { baseFields, toJSON } from './BaseFields.js';

const SubjectSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true },
    code:     String,
    course:   String,
    semester: Number,
    credits:  Number,
    type:     String,
    college:  { type: mongoose.Schema.Types.ObjectId, ref: 'College',    index: true },
    department:{ type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    teacher:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

SubjectSchema.index({ teacher:  1 }, { sparse: true });
SubjectSchema.index({ course:   1 });
SubjectSchema.index({ semester: 1 });
// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)

// Compound indexes for common queries
SubjectSchema.index({ college: 1, department: 1, semester: 1 });
SubjectSchema.index({ department: 1, course: 1, semester: 1 });

toJSON(SubjectSchema);
export default mongoose.model('Subject', SubjectSchema);

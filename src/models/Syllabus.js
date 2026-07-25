/**
 * SAL Portal – Syllabus Model
 * File: src/models/Syllabus.js
 *
 * Changes from original:
 *  5. Database Indexes – added:
 *       • subject    – lookup syllabus items for a subject
 *       • teacher    – lookup items created by a teacher
 *       • college    – college-scoped queries
 *       • department – department-scoped queries
 *       • isDeleted  – soft-delete filter
 *       • Compound (college, department, course, semester) – syllabus report query
 */

import mongoose from 'mongoose';
import { baseFields, toJSON } from './BaseFields.js';

const SyllabusSchema = new mongoose.Schema(
  {
    topic:       String,
    subject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    subjectName: String,
    teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    course:      String,
    semester:    Number,
    completedOn: Date,
    // These were being silently dropped before (unknown fields are ignored,
    // not errors, under Mongoose's default strict mode) even though the
    // "New Syllabus Entry" form has always collected them.
    date:        Date,
    desc:        String,
    duration:    Number,
    method:      String,
    attachment:     String, // data URI — PDF/Word/PPT/image, see routes/teacher.routes.js POST /syllabus
    attachmentName: String,
    college:     { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    department:  { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

SyllabusSchema.index({ subject:    1 }, { sparse: true });
SyllabusSchema.index({ teacher:    1 }, { sparse: true });
SyllabusSchema.index({ college:    1 });
SyllabusSchema.index({ department: 1 });
// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)

// Compound: syllabus report
SyllabusSchema.index({ college: 1, department: 1, course: 1, semester: 1 });

toJSON(SyllabusSchema);
export default mongoose.model('Syllabus', SyllabusSchema);

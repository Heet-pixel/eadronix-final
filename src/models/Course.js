/**
 * SAL Portal – Course Model
 * File: src/models/Course.js
 *
 * Changes from original:
 *  5. Database Indexes – added:
 *       • college    – required field, index for college-scoped lookups
 *       • department – required field, index for department-scoped lookups
 *       • isDeleted  – soft-delete filter
 *       • Compound (college, department, isDeleted) – active courses in a dept
 */

import mongoose from 'mongoose';
import { baseFields, toJSON } from './BaseFields.js';

const CourseSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    code:        { type: String, trim: true },
    description: String,
    type:        { type: String, default: 'UG', enum: ['UG','PG','Diploma','PhD','Certificate','Other'] },
    duration:    { type: String, default: '3 Years' },
    totalSeats:  Number,
    totalSems:   { type: Number, default: 6 },
    headTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    college:     { type: mongoose.Schema.Types.ObjectId, ref: 'College',    required: true },
    department:  { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

CourseSchema.index({ college:    1 });
CourseSchema.index({ department: 1 });
// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)

// Compound: active courses in a department
CourseSchema.index({ college: 1, department: 1, isDeleted: 1 });

toJSON(CourseSchema);
export default mongoose.model('Course', CourseSchema);

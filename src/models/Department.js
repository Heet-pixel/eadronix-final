/**
 * SAL Portal – Department Model
 * File: src/models/Department.js
 *
 * Changes from original:
 *  5. Database Indexes – confirmed and added:
 *       • college             – already inline-indexed, confirmed
 *       • (college, shortCode) – unique compound already existed, confirmed
 *       • hod                 – look up "which department does this HOD manage"
 *       • isDeleted           – soft-delete filter
 *       • (college, isDeleted) – active departments in a college
 */

import mongoose from 'mongoose';
import { baseFields, toJSON } from './BaseFields.js';

const DepartmentSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    shortCode: { type: String, required: true, uppercase: true, trim: true },
    college:   { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
    hod:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    coHod:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Unique compound – prevents duplicate dept code within a college (unchanged)
DepartmentSchema.index({ college: 1, shortCode: 1 }, { unique: true });

// HOD reverse-lookup
DepartmentSchema.index({ hod: 1 }, { sparse: true });
DepartmentSchema.index({ coHod: 1 }, { sparse: true });

// Soft-delete filter
// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)

// Active departments in a college
DepartmentSchema.index({ college: 1, isDeleted: 1 });

toJSON(DepartmentSchema);
export default mongoose.model('Department', DepartmentSchema);

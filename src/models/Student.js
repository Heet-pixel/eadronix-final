/**
 * SAL Portal – Student Model
 * File: src/models/Student.js
 *
 * Changes from original:
 *  5. Database Indexes – added indexes for all required fields:
 *       • rollNumber / roll / rollNo – all three aliases indexed for lookup
 *       • studentId  – not present as a field; roll is the student identifier
 *       • college    – already inline-indexed, confirmed
 *       • department – already inline-indexed, confirmed
 *       • semester / sem – both aliases indexed
 *       • email      – for lookup by email
 *       • Compound (college, department, semester) – covers the most common
 *         HOD/teacher query: "all students in dept X, sem Y"
 *       • Compound (department, roll) – already existed; kept and confirmed
 *       • user       – for reverse-lookup from User → Student
 */

import mongoose from 'mongoose';
import { baseFields, toJSON } from './BaseFields.js';

const StudentSchema = new mongoose.Schema(
  {
    name:          { type: String, required: true, trim: true },
    roll:          String,
    rollNo:        String,
    rollNumber:    String,
    email:         { type: String, lowercase: true, trim: true },
    phone:         String,
    mobile:        String,
    gender:        String,
    dob:           Date,
    bloodGroup:    String,
    address:       mongoose.Schema.Types.Mixed,
    city:          String,
    parentName:    String,
    parentPhone:   String,
    parentEmail:   { type: String, lowercase: true, trim: true },
    // Profile photo, stored as a data URI. One field, read everywhere (Parent
    // portal, HOD student list/details, Admin, Super Admin) — no duplication,
    // since they all read this same Student document.
    avatar:        String,
    admissionYear: Number,
    category:      String,
    status:        { type: String, default: 'Active' },
    course:        String,
    courseName:    String,
    semester:      Number,
    sem:           Number,
    college:       { type: mongoose.Schema.Types.ObjectId, ref: 'College',    index: true },
    department:    { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Roll-number variants (the schema uses three field names for historical reasons)
StudentSchema.index({ roll:       1 });
StudentSchema.index({ rollNo:     1 });
StudentSchema.index({ rollNumber: 1 });

// Email lookup (students can log in with email)
StudentSchema.index({ email: 1 });

// Semester variants
StudentSchema.index({ semester: 1 });
StudentSchema.index({ sem:      1 });

// User back-reference
StudentSchema.index({ user: 1 });

// Parent email lookup. Uniqueness is enforced at the app layer (scoped to
// isDeleted:false) rather than via a DB unique index, matching how `email`
// and `roll` are handled elsewhere in this schema — a hard unique index would
// wrongly block re-using an email after a student is soft-deleted.
StudentSchema.index({ parentEmail: 1 });

// Soft-delete filter (isDeleted comes from baseFields)
// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)

// Compound: dept + roll (already existed – kept)
StudentSchema.index({ department: 1, roll: 1 });

// Compound: the most common HOD/teacher query pattern
StudentSchema.index({ college: 1, department: 1, semester: 1 });

// Compound: college + isDeleted for fast college-scoped active-student queries
StudentSchema.index({ college: 1, isDeleted: 1 });

toJSON(StudentSchema);
export default mongoose.model('Student', StudentSchema);

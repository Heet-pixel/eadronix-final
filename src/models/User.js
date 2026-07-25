/**
 * SAL Portal – User Model
 * File: src/models/User.js
 *
 * Changes from original:
 *  4. Session Cleanup – SessionSchema now has a `createdAt` field (was
 *     missing) so that issueTokens() can sort sessions chronologically
 *     when enforcing the MAX_SESSIONS cap.
 *
 *  5. Database Indexes – added compound and single indexes as required:
 *       • email      – already unique (implicit index), confirmed.
 *       • role       – single field index for role-based lookups.
 *       • college    – single field index for college-scoped queries.
 *       • isDeleted  – already in baseFields but explicitly confirmed.
 *       • Compound (college, role) for common "get all teachers in college" queries.
 *       • Compound (college, isDeleted) for soft-delete-filtered scans.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { baseFields, toJSON } from './BaseFields.js';

const SessionSchema = new mongoose.Schema(
  {
    deviceId:         String,
    refreshTokenHash: { type: String, select: false },
    remember:         Boolean,
    // FIX: createdAt was missing – needed by session eviction sort in auth.controller.js
    createdAt:        { type: Date, default: Date.now },
    expiresAt:        Date,
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    email:     { type: String, required: true, lowercase: true, trim: true, unique: true },
    phone:     String,
    // Profile photo, stored as a data URI (e.g. "data:image/jpeg;base64,...").
    // See controllers/common.js#validateImageDataUri for size/type limits.
    // One field, read everywhere (HOD lists, Admin, dashboards) — no duplication.
    avatar:    String,

    passwordHash: { type: String, select: false },

    role: {
      type: String,
      enum: [
        'super_admin', 'superadmin', 'admin', 'principal',
        'hod', 'co_hod', 'teacher', 'student', 'parent',
      ],
      required: true,
    },

    college:        { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    department:     { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    // Legacy single-child reference — kept in sync as "first child" for any
    // older code path that hasn't moved to `students` yet.
    student:        { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    // A parent can have more than one child in the system, all sharing the
    // same parent login/email. `students` is the real source of truth.
    students:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],

    designation:    String,
    qualification:  String,
    experience:     String,
    subject:        String,
    course:         String,
    // Spec item 3: required on Teacher Details, validated both ends.
    emergencyContact: String,

    firstLogin:       { type: Boolean, default: true },
    loginAttempts:    { type: Number,  default: 0 },
    loginLockedUntil: Date,

    sessions: [SessionSchema],

    ccAssignments: [
      {
        course:     String,
        semester:   Number,
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        assignedAt: { type: Date, default: Date.now },
      },
    ],

    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// email is declared unique above (implicit index – no duplicate needed)

// Single-field indexes
UserSchema.index({ role:      1 });
UserSchema.index({ college:   1 });
// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)

// Compound indexes for common query patterns
// "Find all active teachers in college X"
UserSchema.index({ college: 1, role: 1 });
// "Find non-deleted users in college X"
UserSchema.index({ college: 1, isDeleted: 1 });
// Login lookup (hot path)
UserSchema.index({ email: 1, isDeleted: 1 });

// ── Instance Methods ──────────────────────────────────────────────────────────

UserSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 12);
  this.firstLogin   = false;
};

UserSchema.methods.comparePassword = async function comparePassword(password) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(password, this.passwordHash);
};

toJSON(UserSchema);
export default mongoose.model('User', UserSchema);

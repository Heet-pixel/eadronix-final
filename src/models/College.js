/**
 * SAL Portal – College Model
 * File: src/models/College.js
 *
 * Changes from original:
 *  5. Database Indexes – added indexes:
 *       • code      – already unique (implicit index), confirmed
 *       • isDeleted – soft-delete filter
 *       • name      – text search / alphabetical listing
 */

import mongoose from 'mongoose';
import { baseFields, toJSON } from './BaseFields.js';

const CollegeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true, unique: true },
    email:   String,
    phone:   String,
    website: String,
    address: {
      street:  String,
      city:    String,
      state:   String,
      pincode: String,
    },
    deletionPasswordHash: { type: String, select: false },
    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// `code` unique index is implicit from the schema definition above.

// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)
CollegeSchema.index({ name: 1 });

toJSON(CollegeSchema);
export default mongoose.model('College', CollegeSchema);

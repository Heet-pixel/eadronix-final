/**
 * SAL Portal – OtpCode Model
 * File: src/models/OtpCode.js
 *
 * Changes from original:
 *  7. Security Audit – added `attempts` field to track wrong-guess count.
 *     The auth.controller.js verifyOtp() function increments this on each
 *     failed bcrypt comparison and invalidates the OTP after MAX_OTP_ATTEMPTS
 *     (5) wrong guesses, preventing brute-force enumeration of the 6-digit code.
 *
 *  5. Database Indexes – added compound index (email, purpose, usedAt, expiresAt)
 *     to match the exact query used in verifyOtp():
 *       OtpCode.findOne({ email, purpose, usedAt: null, expiresAt: { $gt: now } })
 *     The existing TTL index on expiresAt is kept for automatic document cleanup.
 */

import mongoose from 'mongoose';

const OtpCodeSchema = new mongoose.Schema(
  {
    email:    { type: String, required: true, lowercase: true, trim: true },
    purpose:  { type: String, enum: ['first_login', 'reset_password'], required: true },
    codeHash: { type: String, required: true },
    usedAt:   { type: Date,   default: null },
    expiresAt:{ type: Date,   required: true },
    // FIX: track wrong-guess count to prevent brute-force
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// TTL index – MongoDB auto-deletes expired documents (unchanged from original)
OtpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index matching the verifyOtp() query pattern for fast lookups
OtpCodeSchema.index({ email: 1, purpose: 1, usedAt: 1, expiresAt: 1 });

// Simple index for sendOtp recent-code checks
OtpCodeSchema.index({ email: 1, purpose: 1 });

export default mongoose.model('OtpCode', OtpCodeSchema);

/**
 * SAL Portal – Schedule Model
 * File: src/models/Schedule.js
 *
 * Changes from original:
 *  5. Database Indexes – confirmed and added:
 *       • college    – already inline-indexed, confirmed
 *       • department – already inline-indexed, confirmed
 *       • teacher    – lookup "what slots is teacher X assigned to"
 *       • isDeleted  – soft-delete filter
 *       • Compound (college, department, course, semester, day) – already existed,
 *         confirmed – this is the main timetable query key
 *       • Compound (teacher, day) – teacher's daily timetable view
 */

import mongoose from 'mongoose';
import { baseFields, toJSON } from './BaseFields.js';

const ScheduleSchema = new mongoose.Schema(
  {
    day:         { type: String, required: true, enum: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
    startTime:   { type: String, required: true },
    endTime:     String,
    time:        String,
    subjectName: { type: String, required: true },
    subject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    teacherName: String,
    teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    room:        { type: String, default: '' },
    type:        { type: String, default: 'Lecture' },
    course:      { type: String, required: true },
    semester:    { type: Number, required: true },
    division:    { type: String, default: '' },
    college:     { type: mongoose.Schema.Types.ObjectId, ref: 'College',    required: true, index: true },
    department:  { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    ...baseFields,
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Teacher slot lookup
ScheduleSchema.index({ teacher: 1 }, { sparse: true });

// Soft-delete filter
// (standalone {isDeleted:1} index removed — already declared via baseFields.isDeleted's `index:true`, was causing a duplicate-index warning)

// Main timetable query (already existed – confirmed)
ScheduleSchema.index({ college: 1, department: 1, course: 1, semester: 1, day: 1 });

// Teacher daily view
ScheduleSchema.index({ teacher: 1, day: 1 });

toJSON(ScheduleSchema);
export default mongoose.model('Schedule', ScheduleSchema);

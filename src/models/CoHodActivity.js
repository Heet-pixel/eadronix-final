// src/models/CoHodActivity.js
//
// Spec item 4: "if any teacher is assigned as co-hod, the main HOD of that
// department will have a co-hod history — whatever changes/updates/work is
// done by the co-hod will be displayed to the HOD."
//
// This is a simple append-only activity log. Every action a Co-HOD takes
// through routes/hod.routes.js (adding a subject, posting an announcement,
// editing a student, building a schedule, etc.) writes one entry here. The
// HOD gets a dedicated "Co-HOD History" page (sidebar) that reads this list.
// We deliberately log the *HOD's own* actions too when they're the one
// acting (see logCoHodActivity — it records whoever the actor actually was),
// so the HOD's history page shows a complete department activity feed, with
// Co-HOD entries visually distinguished on the frontend.

import mongoose from 'mongoose';

const CoHodActivitySchema = new mongoose.Schema(
  {
    college:      { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
    department:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    actor:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorName:    String,
    actorRole:    { type: String, enum: ['hod', 'co_hod', 'admin', 'principal', 'super_admin', 'superadmin'], required: true },
    message:      { type: String, required: true },
  },
  { timestamps: true }
);

CoHodActivitySchema.index({ department: 1, createdAt: -1 });

export default mongoose.model('CoHodActivity', CoHodActivitySchema);

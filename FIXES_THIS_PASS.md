# Fixes — this pass

## 1. HOD → Teacher profile showing "Scheduled 0 / Taken 0 / Syllabus 0 / Attendance marked 0"
**Root cause:** `src/routes/hod.routes.js` used `Syllabus.find(...)` inside
`GET /teachers/:id/detail` to compute those numbers, but `Syllabus` was never
imported in that file. Every call threw a `ReferenceError`, the request
500'd, and the frontend's try/catch silently fell back to `metrics = {}`
(all zeros).
**Fix:** added the missing `import Syllabus from '../models/Syllabus.js';`.
The endpoint's calculation logic was already correct — it now actually runs.

## 2. Teacher → click a student → "No attendance data available"
**Root cause:** the frontend calls two different endpoints — a summary call
(`/teacher/students/:id/attendance`) and a per-subject detail call
(`/teacher/students/:id/attendance/subject?subject=X`) — but the backend only
defined one route, and it was hard-coded to filter by a `subject` query
param. The summary call therefore always got back an empty subject list
(query string had no `subject`), and the detail call actually 404'd (the
path didn't match at all).
**Fix:** split into two real routes in `src/routes/teacher.routes.js`:
- `GET /students/:studentId/attendance` → per-subject summary
  (`{name, present, absent, total}`), scoped to **this teacher's own**
  submitted attendance for that student.
- `GET /students/:studentId/attendance/subject?subject=X` → full
  lecture-by-lecture log for one subject (date, status, topic, time).

## 3. HOD → Add Student: parent email required, should be optional; student email should be required
**Fix:**
- `hod/js/students.js`: swapped the "required" marker from Parent Email to
  Student Email; validates a real email format for both, but only *requires*
  the student's.
- `src/controllers/common.js`: `createStudent()` gained a
  `requireStudentEmail` option (default `false`, so nothing else is
  affected).
- `src/routes/hod.routes.js`: the HOD's single "Add Student" endpoint now
  calls `createStudent(req.body, req.user, { requireParentEmail: false,
  requireStudentEmail: true })`. Bulk Excel import is unchanged.

## 4. Lecture topic not visible to the student
**Root cause:** `Attendance.topic` was already being saved to Mongo, but
`src/routes/student.routes.js`'s attendance endpoint didn't include it in
the per-record payload sent to the frontend, and the student UI didn't
render it.
**Fix:** backend now includes `topic` on every attendance record;
`student-parent/js/attendance.js` renders it in the subject-detail view,
directly above the teacher's name (`.att-session-topic`, styled in
`student-parent/css/style.css`).

## 5. HOD "Mark Attendance" — now the same step-by-step flow as the Teacher portal
- Deleted a second, completely dead "Attendance" screen
  (`loadAttendance`/`renderAttPage`/`toggleAttCard`/`markAllAtt`/
  `saveAttendance` + the unused `attendance: loadAttendance` mapping in
  `app.js`) — confirmed via search it was never linked to any nav item or
  DOM element (no `#attContent` in `hod/index.html`, no
  `data-page="attendance"`).
- Rebuilt the real "Mark Attendance" screen as a 4-step wizard, mirroring the
  Teacher portal: **Select Class → Select Subject → Mark Students (card
  grid, tap to toggle Present/Absent) → Confirm & Save**. Wired to the
  existing, already-working `POST /api/hod/attendance` endpoint — no backend
  behaviour change needed there.
- Fixed a real bug in the save flow: a failed API save was being silently
  swallowed and still showed "Attendance saved!" — it now surfaces the
  actual server error and does not falsely mark the lecture as recorded.
- Added the small set of new CSS classes needed for the stepper/subject
  chips/confirm panel to `hod/css/style.css`, reusing the app's existing
  color variables and the already-styled photo-card grid.

## 6. Profile photo rules (only photo editable; HOD's own profile view-only, edited by Admin)
Audited every portal — this was already implemented correctly and needed no
changes:
- **Student**: `POST /student/profile/photo` (self); no `PUT /profile` route
  exists — no other field is self-editable.
- **Teacher**: `PUT /teacher/profile` explicitly returns 403 ("ask your HOD");
  `POST /teacher/profile/photo` lets the teacher change only their photo.
- **HOD**: `GET /hod/me` + `POST /hod/profile/photo` only — no self-edit
  route for any other field. HOD's own Profile page (`hod/index.html`)
  matches this: read-only detail card, photo upload button, and an explicit
  note ("Contact Admin/Super Admin to change any other detail").
- **Admin**: `PUT /admin/hod/:id` and `PUT /admin/teachers/:id` let Admin
  edit full HOD/Teacher records (including photo) — this is the "Admin fills
  in the details" path referenced by HOD's own profile note.

## Sanity checks performed
- `node --check` on every modified file (all ESM, all pass).
- Booted `server.js` to confirm no import-time or route-registration errors
  across `hod.routes.js`, `teacher.routes.js`, `student.routes.js`,
  `common.js` (process reaches the Mongo-connect step cleanly).
- Confirmed every CSS class referenced by the new HOD stepper markup exists
  in `hod/css/style.css` (fixed two mismatches found along the way:
  `.btn-accent` → `.btn-primary`, and a nonexistent `.hod-proxy-toggle`
  class swapped for the existing `.proxy-toggle`).
- Diffed the full project against your original upload — exactly the 10
  files listed above changed, nothing else.

## Files changed
- `hod/css/style.css`
- `hod/js/app.js`
- `hod/js/attendance.js`
- `hod/js/students.js`
- `src/controllers/common.js`
- `src/routes/hod.routes.js`
- `src/routes/student.routes.js`
- `src/routes/teacher.routes.js`
- `student-parent/css/style.css`
- `student-parent/js/attendance.js`

---

# Round 2 — Proxy lecture badge

## Student attendance: show "Proxy Lecture" above the clock when applicable
- `Attendance.isProxy` was already saved to Mongo when a lecture is marked
  proxy, but the student-facing endpoint didn't pass it through, and the UI
  had nowhere to show it.
- `src/routes/student.routes.js`: added `isProxy` to each per-record payload.
- `student-parent/js/attendance.js`: renders a `🔁 Proxy Lecture` badge as
  the very first element in the session card — above the clock/date/mode
  row — whenever `isProxy` is true. Styled in `student-parent/css/style.css`
  (amber pill, with a dark-mode variant).
- Student and Parent share this same file/route, so both see it.

---

# Round 3 — HOD department name bug, HOD attendance time UX, Super Admin analytics/edit/hard-delete

## HOD sidebar showing a raw MongoDB ID instead of the department name
**Root cause:** `buildHodProfile()` in `src/routes/hod.routes.js` returned
`department: user.department` — on the `User` model this is a raw
`ObjectId` reference, never resolved against the `Department` collection.
**Fix:** now looks up the real `Department` document and returns its
`name`; the raw id is kept separately as `departmentId` in case anything
needs it later. Checked every frontend usage — all display-only, so this
one change fixes it everywhere (sidebar, profile page, report
headers/filenames).
Also fixed the HOD sidebar brand label, which was hardcoded "Admin" (a
copy-paste leftover) — now reads "Eadronix" with an "HOD Portal" subtitle.

## HOD Mark Attendance — Start/End time UX
- Start Time now auto-calculates End Time (+60 min, reusing the Schedule
  module's own `calcEndTime()`), and stops auto-overwriting once the HOD
  edits End Time directly.
- Removed duplicated 30-minute-minimum validation logic (existed twice,
  copy-pasted) — consolidated into one `_validateMaTiming()` helper used by
  both the Review step and the final Save, with clearer, distinct messages
  ("end time must be after start time" vs. "must be at least 30 minutes").

## Super Admin: total people per college, shown per-college in Analytics
- `collegeSummary()` (`src/controllers/common.js`) now also returns
  `totalPeople` (students + teachers/HODs + admins/principals combined).
- `GET /api/super/analytics` now returns a `perCollege` array — every
  college's name, code, active status, and full headcount breakdown.
- `super-admin/js/analytics.js` renders one card per college with the
  **college name at the top**, total headcount, and a role breakdown below
  it. New CSS in `super-admin/css/style.css`.

## Super Admin: Edit College after creation
- The backend `PUT /colleges/:id` already existed but was never wired to
  any UI, and had a mass-assignment bug (`{ ...req.body }` spread directly
  into `findByIdAndUpdate` — a crafted payload could have overwritten
  `deletionPasswordHash`, `isDeleted`, `active`, etc.). Fixed to whitelist
  only the intended editable fields, and to reject a code collision with
  another college.
- Added a real "Edit College" modal (`super-admin/index.html`), an Edit
  button on the College Information card, and
  `CollegeDetail.openEdit()` / `handleEditCollege()`
  (`super-admin/js/college-detail.js`) to wire it up, bound at startup in
  `super-admin/js/app.js` alongside the app's other modal forms.

## Hard delete + "type the name to confirm" on every delete
- Audited every delete flow across Super Admin and Admin. Super Admin was
  already fully correct (colleges/staff/teachers/admins/students all use
  `hardDeleteCascade` on the backend, `requireTypedName` confirmation on
  the frontend) — verified, no changes needed.
- Found the Admin/Principal portal was inconsistent: Students and HOD
  deletes already used the app's own `UI.confirmDelete` (typed-name
  required), but **Teacher, Department, Course (both places it appears),
  Subject, and Notice** deletes still used a plain browser `confirm()`.
  Fixed all five to match the pattern that was already correct elsewhere —
  all now require typing the exact name (or, for notices, the title)
  before the permanent delete proceeds.
- Found and deleted `admin/js/data.js` — a 729-line file containing
  duplicate/superseded versions of this exact logic that was **never
  actually loaded** by `admin/index.html` (confirmed via the page's real
  `<script>` tags) — fully dead code, removed rather than left to rot.

## Sanity checks performed (this round)
- `node --check` on every modified file.
- Booted `server.js` again — clean, no import/route-registration errors.
- Confirmed every new CSS class used exists (or has a safe fallback).
- Diffed the full project against the original upload — exactly the files
  listed above changed across all three rounds, nothing else.

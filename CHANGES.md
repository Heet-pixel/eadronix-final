# Changes in this pass

Scope for this pass (agreed with you): **Subject master list + HOD timetable +
attendance conflict rules** — spec sections 5 & 6 of your prompt, plus one
pre-existing bug I found while reading the code. The other 8 spec sections
(parent accounts/sync, photo uploads, teacher weekly schedule UI, attendance
history/edit, teacher profile, cross-role broadcast, etc.) are **not** in this
pass — let's do those as separate, verifiable increments.

## 0. Bug fix (pre-existing, not part of the spec)
`src/controllers/common.js` called `Course.findOne(...)` inside
`normalizeSubjectPayload()` but never imported the `Course` model. Every
subject create/update that included a course name would throw
`ReferenceError: Course is not defined` at runtime. Fixed by adding the import.

## 1. Subjects are now Admin-only, everywhere (spec item 5)
- `src/routes/hod.routes.js`: `POST/PUT/DELETE /api/hod/subjects/*` now return
  `403` with a clear message. HOD's frontend never actually called these
  (confirmed by search), so this is a zero-risk lock-down. `GET /subjects`
  (read the master list) is unchanged.
- `src/controllers/common.js`: new `resolveSubjectForSlot()` — resolves a
  subject strictly against the Admin-created `Subject` collection for the
  given college/department/course/semester. It **throws** if no match is
  found; it never creates one. Used everywhere a subject is attached to a
  schedule slot or an attendance record.

## 2. HOD timetable now selects subjects/teachers, never types them (spec item 5)
- `hod/js/schedule.js`: the "Add Slot" modal and the per-slot editor now use
  `<select>` dropdowns sourced from the Admin subject list and your
  department's teacher list, instead of a free-text subject input. The
  payload sent to the backend now carries `subjectId` + `teacher` (ids), not
  a typed string.
- `src/routes/hod.routes.js` (`POST /schedule`, `PUT /schedule/:id`): every
  slot's subject is resolved via `resolveSubjectForSlot` before anything is
  saved. If any slot in a batch fails, **nothing in that batch is saved** —
  you get one clear error instead of a half-written timetable.

## 3. Schedule conflict detection (spec item 6)
- `src/controllers/common.js`: new `findConflictingSlot()` / `timesOverlap()`.
  Two checks, both enforced on create and edit:
  - **Class conflict** — the same college/department/course/semester/day
    already has an overlapping lecture (any teacher) → rejected with
    `"This class already has a lecture scheduled during this time by
    [Teacher Name]."` (your exact wording from the spec).
  - **Teacher conflict** — the same teacher already has an overlapping
    lecture elsewhere on that day → rejected with a similar message.
  - Back-to-back slots (e.g. 9:00–10:00 then 10:00–11:00) are **not** treated
    as conflicts — boundary-touching slots are fine, only real overlap is
    blocked. (Verified with unit tests, see below.)

## 4. Teacher attendance: subject is derived, never typed (spec item 5)
- `src/routes/teacher.routes.js` (`POST /attendance`): the subject must
  resolve via `resolveSubjectForSlot`; if it doesn't match the master list,
  the request is rejected. If the subject has an assigned teacher and it
  isn't you, you get `403` ("You are not the assigned teacher for...").
- `teacher/js/attendance.js`: removed the "type a subject name" fallback
  that appeared when no subject was assigned to a class. It's now replaced
  with a clear message telling the teacher to ask HOD/Admin to add the
  subject to the timetable — attendance simply can't be marked without a
  real, scheduled subject.
- `src/routes/hod.routes.js` (`POST /attendance`, HOD-side bulk entry): same
  lock-down applied for consistency.

## What I verified (no live MongoDB is reachable in this sandbox — outbound
access to MongoDB's download servers is blocked by network policy here, so a
full end-to-end run against a real database isn't possible in this
environment):
- `node --check` on every edited file (syntax).
- Dynamically imported every edited route/controller file under Node's ESM
  loader to catch import-time errors (e.g. the `Course` bug above) — clean.
- Unit-tested `timesOverlap()` directly against 6 boundary cases (overlapping,
  adjacent, disjoint, identical) — all pass.
- Booted the full Express app (`server.js`) with all routes mounted against an
  unreachable Mongo URI — the app assembles and starts without throwing,
  confirming the new imports/exports/wiring are correct. (It can't reach a
  real database here, so please run `npm install && npm start` against your
  own MongoDB Atlas/local instance and click through: Admin → create a
  subject → HOD → build a timetable slot for that subject/teacher → try to
  double-book the same teacher/time → Teacher → mark attendance for that
  class.)

## Not done yet (remaining spec items — say the word and I'll do the next one)
1. Parent Email field + Parent login + Student↔Parent sync — **DONE, see below**
2. Student profile photo upload + cross-role propagation — **DONE, see below**
3. HOD → Teacher Details: emergency contact + "weekly schedule" UI (this pass
   built the underlying Schedule/conflict engine that item 3 needs — the
   remaining work is mostly the Teacher Details page UI) — **DONE, see below**
4. Teacher attendance history + edit-in-place (without creating a new lecture) — **DONE, see below**
5. Teacher profile page (photo + personal detail editing) — **DONE, see below**
# Pass 13: Missing CSS (HOD + Teacher schedule pages), Student Remove/Delete, Excel import bug, time validation

## 1. HOD's Schedule page rendering as plain unstyled text
Root cause: the entire subject-locked schedule builder UI (built across
several earlier passes) used about 28 CSS class names that were never
actually given any styling at all — not broken, just never written. This
is why the page rendered as plain stacked text with no cards, spacing, or
borders. Added complete CSS for the whole builder: the semester accordion,
day tabs, per-slot editor row (time/subject/teacher/room/type), the
subject-overview strip, and the Add-Slot modal (which was using a
`.modal-card` class that didn't exist anywhere — the real class was
`.modal-box`; added `.modal-card` as its own properly-styled twin rather
than renaming it everywhere it's used).

## Teacher's timetable "nothing visible" — found a second, real cause
Re-traced the HOD→Teacher schedule data flow end-to-end again and still
found no further bug there — but while checking, found Teacher's own
Schedule page had the exact same class of problem as HOD's: `.day-tabs`,
`.day-tab`, `.day-panels`, and critically `.day-schedule` (the element that
shows/hides each day) had no CSS at all. Without a rule to hide the
non-selected days, clicking between Mon/Tue/Wed/etc had no visible effect —
which would look exactly like "nothing is visible" regardless of whether
the underlying data was actually there. Added the missing CSS.

## 2. Student management in HOD — Remove (reversible) vs Delete (permanent)
- **Delete** is now a true permanent removal from the database (previously
  it was soft-deleted like everything else in the app — changed specifically
  for this one action, per your request). Requires typing the student's
  exact full name to confirm before it will proceed — the same pattern is
  now also on Teacher deletion.
- **New: Remove** — a reversible "off-boarding." Every field stays exactly
  as it was (course, semester, attendance history, marks — nothing
  touched), the student just drops out of the normal course/semester tabs
  and appears only in a new "Removed" section.
- **New: Recover** — from the Removed section, select one or more students
  with checkboxes, confirm, and they're placed straight back into whatever
  course and semester they already had — nothing needs re-entering.
- **Fixed the actual visual bug** you reported: the student card was
  wrapped in a `<button>` with zero CSS of its own, which broke the flex
  layout that positions the photo and info side-by-side — explains the
  overlapping/jumbled text in your screenshot. Removed that wrapper
  entirely so the row structure now matches Teacher's simpler layout, per
  your request, and both now share one clean set of styles.

## 3. Excel import — the actual cause of "0 students imported"
`createStudent()` has required a parent email since a much earlier pass —
but the Excel import screen never had a "Parent Email" column to map in
the first place. Every single imported row was failing that validation,
silently, which is exactly why it always reported 0 imported with no
visible reason. Fixed on two levels:
- Bulk import no longer requires a parent email at all — a missing one
  just means no parent account is created yet (can be added later from the
  student's Details page, same as before). The single "Add Student" form
  still requires it, unchanged.
- The import now reports precisely which rows failed and why, instead of
  swallowing every error silently — this is what actually would have
  surfaced the real problem immediately instead of just showing "0".

Also fixed the specific column-matching bug you saw ("Parent Name" being
offered as a match for "Full Name"): the old matching logic checked
whether one string merely *contained* the other, and "parentname" contains
"name" — so any header with the word "name" in it could falsely match the
"Full Name" field. Column matching now always prefers an exact match first,
and a field can never be claimed by two different columns at once.

Also: the preview really did only ever show the first 3 rows, regardless of
how many were in the file — now shows all of them, in a scrollable box.
Applied the identical fixes (all-rows preview, per-row error reporting) to
Teacher import, and relaxed its overly strict "must have a subject" rule
(a teacher's subject is properly assigned later through the timetable, not
through this import screen).

## 4. Attendance & schedule time rules
- Attendance can no longer be marked for a future date — enforced on the
  backend (so it can't be bypassed) and on the frontend (the date picker
  itself won't let you pick tomorrow or later).
- Every lecture — whether created via the Schedule builder, the "Add
  Lecture" form, or attendance marking — must now be at least 30 minutes
  long, checked both instantly in the browser and again on the server.
- Found and fixed a real gap while adding this: **HOD's own Mark Attendance
  form had no Start Time / End Time inputs at all** — meaning the
  cross-teacher conflict check from Pass 10 had nothing to actually compare
  against when HOD (rather than a teacher) marked attendance. Added them.
- Unit-tested both new rules directly (exact 30-minute boundary, a lecture
  ending before it starts, yesterday/today/tomorrow) — all pass.

## Also fixed
Teacher's portal had no visible Logout button at all — the underlying
logout function was already fully built and ready, it just had nothing to
attach to. Added the button to match every other role.

## A note on this pass's code style
Per your request, new code added in this pass (the Excel import matching
logic and the time/duration validators) uses fuller function names,
step-by-step comments explaining *why* something is done, and JSDoc-style
notes on what each function does and what breaks if it's removed. I did
not rewrite the rest of the existing codebase to this style in this same
pass — that would be a much larger, separate undertaking across thousands
of lines in five different frontends, and mixing a full style rewrite into
a bug-fix pass would make it far harder to verify nothing broke. Happy to
take that on as its own focused pass if you'd like.

## 1. "CORS: origin not allowed" on login
Root cause: this app serves both the frontend and the API from one process
(same Express server, same port) — so a real deployment should never need
CORS at all for the app talking to itself. But the old fallback, when
`CORS_ORIGIN` wasn't configured in production, set `origin: false`, which
blocks *everything* — and modern browsers attach an `Origin` header even to
same-origin POST/PUT/DELETE requests (not just genuinely cross-origin
ones), so the app's own login page calling its own `/api/auth/*` got
rejected by its own server.

Rewrote the CORS logic to always recognize and allow a genuinely
same-origin request (comparing the incoming `Origin` header against the
request's own protocol+host) regardless of `CORS_ORIGIN` — only requests
that are actually cross-origin get checked against the allow-list. Also
made it trust Render's own `RENDER_EXTERNAL_URL` (set automatically on every
Render deploy) automatically, so a single-service Render deployment works
without having to manually set `CORS_ORIGIN` at all. Genuinely cross-origin
requests from an unlisted domain are still correctly rejected — verified
with 4 targeted tests (same-origin matching config, same-origin with no
config, cross-origin from an unlisted domain, and no-Origin-header
server-to-server requests) — all behave correctly.

## 2. Mongoose duplicate schema index warnings (every model, on every boot)
Every single model in the database had the exact same mistake: `isDeleted`
is already indexed once via the shared `baseFields` (`index: true` on the
field itself), but 11 of the 13 model files *also* declared their own
separate `ModelName.index({ isDeleted: 1 })` — an exact duplicate of the
same index, registered twice. Removed the redundant standalone declaration
from all 11 affected models (Attendance, College, Course, Department,
Mark, Notice, Schedule, Student, Subject, Syllabus, User), keeping every
*compound* index that includes `isDeleted` alongside other fields (like
`{college:1, isDeleted:1}`) since those are genuinely different, useful
indexes — only the exact duplicates were removed. Verified with a full
production-mode server boot: previously printed a warning per model on
every single startup (matching your screenshot exactly); now completely
silent.

This isn't just cosmetic — on MongoDB Atlas specifically, duplicate index
definitions can cause Mongoose to attempt building the same index twice,
which wastes write capacity/time on every deploy and can occasionally
produce confusing "index already exists with different options" errors
later if the two declarations ever drift apart (e.g. one gets a `unique`
option added and the other doesn't). Cleaning this up now avoids that
entirely.

## 1. Syllabus upload error + consolidating two forms into one
Found the exact bug from your screenshot: `POST /teacher/syllabus` passed the
subject **name** string straight through to a field the database expects to
be an ObjectId reference — same class of bug as the schedule save error from
last time, different endpoint. Fixed by resolving the subject through the
master list first, same as everywhere else.

Also consolidated per your request: removed the separate "Upload Syllabus
Document (PDF)" card entirely. The existing "New Syllabus Entry" form is now
the only one — its "Attach Material" file picker actually reads and uploads
the file now (previously decorative: it showed the filename but never sent
the file itself, so nothing was ever really attached). Saving an entry with
an attachment shows it in "📋 Uploaded Entries" with view/download links, and
separately creates the linked Notice so students in that course+semester see
it too — one save, one form, matches both places it needs to appear.

Also found the file's attachment/desc/duration/method/date fields were being
silently dropped on save — the `Syllabus` database model never had fields
for them, so Mongoose quietly discarded them every time (not an error, just
silently ignored). Added the missing fields.

## Removed the PDF-download option from Student's Attendance History
Per your request — the download button and its handler are gone. PDFs
attached to Notices (from HOD/Admin/Teacher) remain downloadable, since
that's a different, deliberate feature.

## 2. HOD's schedule → Teacher's timetable
I couldn't find a further bug in the data flow itself after re-tracing it
end-to-end again — but found the save endpoint would silently accept a
schedule slot with **no teacher assigned at all** (blank selection), which
would obviously never show up on anyone's timetable, with no error telling
the HOD why. Made teacher selection a hard requirement on save, so this
fails loudly with a clear message instead of silently producing an orphaned
lecture. If a teacher's timetable is still empty after this with an actual
teacher selected, that's a strong signal something about that specific data
needs a closer look together — happy to dig in with you on a specific case.

## 3. HOD's light-mode color bug — found and fixed
Root cause: `hod/css/style.css` had **two entire stylesheets concatenated
into one file** — a leftover copy-paste artifact complete with a stray
`</style>` tag sitting in the middle of a `.css` file. The second one
unconditionally redeclared `--bg` and other core variables in dark colors,
with no `[data-theme]` scoping at all — so it silently overrode the light
theme's colors regardless of which theme was actually selected. Confirmed
this entire ~470-line section targeted element IDs (`#sb`, `#topbar`,
`#main`) that don't exist anywhere in the current HTML — 100% dead code,
safe to remove outright, which I did.

**Found the identical pattern in Teacher's CSS too** while checking for it
elsewhere — same stray `</style>`, same dead `#sb`-style section, same
unconditional `:root` override. This one happened to redeclare `--bg` with
similarly-light values, and a previous edit had already partially patched
around it with two duplicate "final theme balance" override blocks (visible
in the file as literal comments) rather than removing the actual cause —
so it wasn't visibly broken, just fragile and duplicated. Removed the dead
section the same way; left the two harmless duplicate patch blocks in place
rather than risk touching more than necessary.

Admin, Student/Parent, and Super Admin do not have this pattern.

## 4. Toast/message readability across dark and light modes
HOD, Teacher, and Admin's success/error toasts used the same color variable
as small badges and card accents elsewhere — fine for that purpose, but
those variables intentionally get *brighter* in dark mode for badges, which
made white text on top of a bright toast background hard to read. Switched
all three portals' toasts to fixed, guaranteed-contrast colors (`#16a34a`
green / `#dc2626` red with white text) that don't change with theme — a
toast's job is to be readable the instant it appears, so it's fine for it to
intentionally not follow the surrounding theme. Student/Parent and Super
Admin already used a safer pattern (normal surface + text colors with only a
colored accent border) and needed no change.

## Also wired in
Teacher's syllabus page now shows a real "📣 Announcements from HOD/Admin"
panel — this JS already existed but was pointed at a page that was never
reachable from anywhere in the app; retargeted it to load with the syllabus
page, where it's now visible.

**Flagging honestly rather than guessing:** the "marks upload history should
also show in this same place" part of your last message — I wasn't fully
sure what shape this should take (a log of which marks entries you've
submitted, shown where exactly?) and didn't want to build something that
might not match what you meant. Tell me a bit more about what that should
look like and I'll build it precisely.

# Pass 8: Bug fixes from your screenshots + follow-up requests

## The random-logout bug — root cause found
This was a **refresh-token race condition**, present in all 4 role frontends
(HOD, Admin, Teacher, Student/Parent — Super Admin's `shared/auth.js` already
had the correct pattern, which is how I knew what the fix should look like).

What was happening: your refresh tokens rotate on every use (a new one is
issued and the old one invalidated, for security). Most pages fire several
API calls close together on load. If your access token happened to be
expired at that moment, *multiple* calls would each independently try to
refresh using the same stored refresh token. The first one would succeed and
rotate the token — but every other concurrent call was still holding the
*old* (now-invalidated) token, so its refresh attempt got rejected, and the
code treated that as "your session is truly dead" and wiped `localStorage`,
logging you out — even though you actually had a perfectly valid, just-
rotated session sitting right there. Clicking around quickly, or landing on
a page that loads several things at once, made this much more likely to hit.

Fixed by sharing one in-flight refresh across all four frontends: if a
second request 401s while a refresh is already in progress, it now waits for
that *same* refresh instead of racing its own. Only redirects to login if
that one shared refresh genuinely fails.

## Attendance History "this lecture record was not found"
The session-lookup was reconstructing a MongoDB query filter from the
decoded session key, and re-deriving date boundaries independently from how
the History list built the key in the first place — two separate paths that
could subtly disagree. Rewritten so both list and detail derive a session's
identity through the exact same function and compare in JS, not through two
independently-built Mongo filters — they can no longer drift apart.

## Image uploads: 100KB limit, images only
Lowered the server-side cap from 3MB to 100KB (`validateImageDataUri` in
`common.js`) and rewrote the client-side compression (student, teacher) to
iteratively shrink dimensions/quality until the result is actually under
100KB, instead of a single fixed compression pass that could still exceed
the limit on a busy/detailed photo. Only JPEG/PNG/WEBP are ever accepted —
unchanged from before, just re-confirmed.

## Teacher timetable not showing HOD-added lectures
I verified the backend query and the data flow end-to-end and couldn't find
a remaining logic bug in either — but the *display* was only ever fetched
once, at login, into an in-memory snapshot. If HOD added a lecture after
that, the teacher wouldn't see it without a full re-login. Fixed: the
Teacher's "My Schedule" page now fetches fresh data every time you open it,
not just once at login. If it's still not appearing after this fix (with a
real logout/login or hard refresh), that would point to something specific
to your data (e.g. the teacher assigned in HOD's "Add Lecture" form not
being the same account the teacher is logged in as) — let me know and I'll
dig further with you.

## Student attendance: show upload time + correct per-lecture date
Two real issues here:
- The lecture date shown was a **single banner covering the entire list**,
  taken from only the *first* session — every other lecture in the list
  displayed under that same (likely wrong) date. Fixed: each lecture card
  now shows its own date.
- Nothing showed *when* the teacher actually submitted the attendance.
  Added `uploadedAt` (the record's `createdAt`) to both the student's
  attendance detail and the teacher's own Attendance History detail —
  shown bottom-left on each card, per your screenshot annotation.
- Also fixed the present/absent label, which literally said "Flag" for a
  present student (a leftover from an incomplete icon design) — now says
  Present / Absent / Leave.

## Stale dashboards (attendance/subject/notice not appearing until re-login)
Found the cause: the Student Dashboard and Student Profile pages cached
their data after the first load and never fetched again for the rest of
the session (`_loaded` flag, presumably meant as an optimization). New
attendance, notices, or subject changes wouldn't appear until a fresh
login. Removed that caching — both now refetch every time you open them,
matching how the Teacher and HOD dashboards already behaved (they never had
this bug). Attendance/Timetable/Notices/Syllabus/Marks pages already
refetched correctly and needed no change.

## Photo visibility for Admin and Super Admin
Admin was covered in Pass 6. Super Admin's frontend never rendered anyone's
photo anywhere, in any view (HOD chips, teacher grid, student table, staff
list) — always initials, even though the data (`avatar`) has been available
in every one of those API responses the whole time. Added a shared
`UI.avatarInnerHtml()` helper and wired it into all four render spots.

# Pass 10: Schedule save bug, permission reversal, date format, real dashboard/notices data

## 1. Admin's HOD/Co-HOD page showing empty
Same bug class as before, just in code I wrote myself this time: the
frontend read `d.data || d.hods`, but `d.data` from this endpoint is a
nested wrapper object (`{hods:[...]}`), which is truthy — so it always won
over the real `d.hods` array, and the page always rendered "No HOD or
Co-HOD appointed yet" regardless of what existed. Fixed.

**Also, a permission reversal per this message:** previously "both add/
delete, only Super Admin edits" — now "Admin has full control (add/edit/
delete), Super Admin is view-only." Implemented exactly as now specified:
Admin's `PUT /hod/:id` is unblocked and works; Super Admin's HOD-appoint
endpoint and its generic staff edit/delete now explicitly block role
hod/co_hod (editing/deleting *other* staff like plain teachers is
unaffected). Super Admin's UI no longer shows Appoint/Edit/Delete controls
for HOD/Co-HOD, only a "view only" note.

## 2. HOD schedule builder — the actual save-breaking bug
Root cause: the server's existing `groupSchedule()` utility stores a slot's
teacher *name* under `.teacher` and the teacher's *id* under `.teacherId` —
but the newer per-slot teacher-select code (Pass 1) assumed `.teacher` held
the id. A freshly-added slot (via the Add Slot modal, same session) stored
its id correctly under `.teacher`; but any slot loaded from the server
retained the *name* there instead. Saving that slot without re-selecting
its teacher sent the literal name string (e.g. `"heetshah761"`) to the
backend as if it were an ObjectId — hence `Cast to ObjectId failed for
value "heetshah761"`. Fixed by using `teacherId` consistently everywhere
in the frontend, matching the server's own convention — every existing
save path was reconciled, not just the one in the screenshot.

Also fixed while in the same code:
- The semester header showed total lecture-slot count ("12 slots") instead
  of subject count ("8 subjects") — now shows subject count, since slot
  count will naturally exceed subject count once a subject has multiple
  lectures/week (see below).
- The subject list showed a single "Alarm HH:MM" time next to each subject,
  implying one fixed time — misleading once a subject can have more than
  one lecture slot. Now shows "N lectures/week" or "Not scheduled yet"
  instead, with no time attached to the subject itself (subjects are fixed
  entities; times belong to individual lecture slots).
- Confirmed (no change needed — already correct): a subject can already
  have multiple lecture slots per day/week with the same or different
  teacher, as long as their times don't overlap — this was always allowed
  by the conflict-checker, it just could never be *saved* due to the bug
  above. Also confirmed a teacher's schedule conflict-check was already
  college-wide, not restricted to one course/semester — "MCA Sem 3 at 10am,
  BCA Sem 1 at 1pm" for the same teacher already works correctly, and their
  Teacher Portal timetable already aggregates every course/semester they
  teach (Pass 4).

## 3. Dates now shown as dd-mm-yyyy everywhere
Added/fixed the shared date formatter in every portal (`UI.date`/`UI.fmt`/
`fmtDate` — each portal had its own name for this) to output `dd-mm-yyyy`
consistently, and routed the handful of places that were calling
`toLocaleDateString()`/`toLocaleString()` directly through the shared
helper instead. Filename-generation code (e.g. exported report filenames)
was already using `en-GB` locale, which is already day/month/year — left
those as-is.

## 4. Student Dashboard — same "d.data is a nested wrapper" bug, at a larger scale
The dashboard frontend expected `{student, stats, attendance, recentNotices,
timetableToday}` but the backend returned a completely different flat shape
— every field the frontend destructured came back `undefined`, so every
section always showed its empty state regardless of real data (matches your
screenshot exactly). Rewrote the backend to return real data in the shape
the frontend already expected:
- **Per-subject attendance** — actual percentage per subject with a real
  code, not just one overall average.
- **Today's classes** — filtered from the class's timetable down to today's
  actual day, not just "the next few upcoming" from whenever.
- **Pending marks** — subjects with no mark record yet for this student.
Also made the Quick Stats cards, attendance bars, and today's-class cards
all clickable — jumping straight to Attendance/Notices/Marks/Timetable, per
your request. (The "See all" / "Full schedule" links you can see in your
screenshot already worked — they just had nothing real to show yet.)

## 5. Notices — three sources, semester targeting, real PDF upload/download
- `Notice` model: added `sourceType` ('notice'/'announcement'/'syllabus'),
  optional `course`/`semester` targeting, and an `attachment` (PDF, same
  data-URI-in-MongoDB approach as photos — see `validatePdfDataUri()`, 5MB
  cap, unit-tested).
- **New:** `POST /api/teacher/notices` — "Upload Syllabus," course+semester
  required (a syllabus always targets one specific class). This entire
  feature didn't exist for teachers before — added the endpoint and a real
  upload card on the Teacher's existing "Upload Syllabus" page.
- Admin's "New Notice" and HOD's "Announcements" forms both **already had A
  file-attach input in their UI** — but it was decorative only: the code
  only ever sent the filename as plain text, never the actual file content.
  Wired both up to actually read and upload the real PDF.
- `studentBundle()`'s notice query now respects course/semester targeting —
  a notice with both set only reaches matching students; leaving them blank
  still reaches the whole department/college as before.
- Student's Notices page: fixed the same `d.data`-wrapper bug found
  everywhere else this session, added filter tabs for Syllabus/
  Announcements/Notices (with the uploading role shown per your spec), and
  a real View/Download link for any PDF attachment.

## 1. Forgot Password showing the raw Gmail error
Two compounding bugs, both fixed:
- `mailer.js`'s `transporter.sendMail()` had **no try/catch**. Any SMTP failure
  (which you'd just hit from the spaced App Password) threw uncaught, and the
  global error handler — which only redacts messages for `status === 500` —
  let it through as-is on the Forgot Password screen since a raw nodemailer
  auth error doesn't carry a `.status` matching that check in every environment.
  Fixed: send failures are now caught, logged server-side with full detail,
  and degrade gracefully instead of throwing.
- Related: if email delivery ever fails for real in production, the endpoint
  was about to report **false success** ("OTP sent... Dev mode...") — the
  person would be told to check an inbox that will never receive anything.
  Fixed: a genuine production send failure now returns an honest error asking
  them to retry or contact the admin, instead of a cheerful lie.

## 2. HOD management in Admin's People section
Turned out this entire feature already existed on the backend and even had a
JS module for it (`admin/js/data.js`'s `loadHOD`) — but there was no HTML
page for it anywhere, no sidebar link, and the live router (`app.js`'s
`navTo()`) never called it. It was 100% unreachable dead code. Built the
missing page, modal, and wiring from scratch:
- Department model: added `coHod` (previously only `hod` — one slot).
- New shared `appointHod()`/`detachHodFromDepartment()` helpers enforce
  "max one HOD + one Co-HOD per department" identically whether Admin or
  Super Admin does the appointing, and clean up the department's reference
  when that person is removed (previously left dangling on delete).
- Admin can now add and remove a department's HOD/Co-HOD from a real page
  (People → HOD / Co-HOD). Editing is blocked for Admin (`403`) — per your
  spec, only Super Admin can view full details or edit; Super Admin's
  existing appoint/edit/remove UI already supported this and now enforces
  the same one-per-role rule.
- Since both just read the same `User` collection scoped to the college,
  whoever appoints a HOD/Co-HOD, the other role sees it immediately — no
  extra sync code needed.

## 3. Profiles are now view-only (photo is the only editable thing)
- Teacher: removed the editable phone/emergency-contact/qualification/
  experience fields and the Save button — all fields now `disabled`, and the
  backend `PUT /teacher/profile` returns 403.
- HOD: previously had **no photo upload at all** (just a static initial
  letter) and no `avatar` in its `/hod/me` response despite the field
  existing on the model. Added `POST /hod/profile/photo` and wired up the
  upload UI — HOD's profile was already view-only (no edit fields existed),
  so photo was the only piece missing.
- Student: already view-only from earlier passes, nothing to change.

## 4. Attendance conflict window — now enforced at marking time, not just scheduling
Previously, the "no overlapping lecture" rule (Pass 1) only applied to the
*timetable* HOD builds. Actual attendance-marking used a free-typed time
that wasn't required to match any timetable slot, so two teachers could
still independently submit overlapping attendance for the same class. New
`findAttendanceTimeConflict()` checks real submitted Attendance records (not
just Schedule) and blocks e.g. a 10:15-12:15 submission if 10:00-11:00
already has attendance for that class — verified against your exact example
with a unit test. Wired into both Teacher's and HOD's attendance-marking
routes identically (HOD's was previously a different, looser implementation
with no subject-lock or conflict checks at all — now it mirrors Teacher's
exactly, per "the working of both should be the same").

## 5. HOD's own Attendance History (sees every teacher, edits any lecture)
Teacher's Attendance History (Pass 5) was already correctly scoped to that
teacher's own lectures only — nothing to change there, it already matches
your spec exactly ("Heet only sees Heet's maths/english lectures"). Added
the HOD-side equivalent: `GET/PUT /api/hod/attendance/history` and
`/session/:key` show and edit **every** teacher's lecture in the department,
with the teacher's name on each row, using the same session-key approach as
Teacher's for consistency. New "🕘 Attendance History" button on HOD's Mark
Attendance page.

## 6 & 7. Student UI colors + a real cross-role theming bug
Matched Student's color palette to Teacher's exactly, keeping Student's
existing CSS variable *names* (`--clr-*`) so no other rule in the file
needed to change — just the color values. While doing this, found the
student CSS had **two separate, conflicting `:root`/`[data-theme="dark"]`
blocks** in the same file (one clearly a leftover, labeled "Final student
polish" mid-file) — the second silently overrode the first via normal CSS
cascade rules, making the first block dead code and the two easy to
accidentally re-diverge in future edits. Removed the duplicate, unified on
one definition. Also found and fixed three spots in Student's own JS
(`profile.js`, `attendance.js`) that referenced CSS variable names
(`--primary`, `--bg`, `--text3`, `--muted`) that don't exist in this file at
all — they were silently falling back to hardcoded colors (e.g. a plain
white border), which is exactly the kind of thing that looks fine in light
mode and slightly wrong in dark mode. Fixed to reference the file's actual
variables.
I did not do a full page-by-page/breakpoint-by-breakpoint responsive audit
of all 5 portals in both themes — that requires visual browser testing I
can't do in this sandbox. The color-system fix above should carry through
correctly everywhere since it's the single source every component reads
from, but if you spot a specific page/breakpoint that still looks off after
this, tell me which one and I'll fix that concretely rather than guess.
- **Student UI re-theming to match Teacher's dark color scheme:** this is a
  full visual redesign of the Student/Parent portal's CSS — different from
  a targeted bug fix or feature addition, and risks breaking layouts across
  every page if rushed. I'd like to scope this properly with you (e.g. do
  you want an exact copy of Teacher's palette, or just "make them feel like
  the same product"?) rather than reskin blind and risk a messy result.
- **Attendance visible to Teacher/HOD/Admin/Super Admin for any given
  student:** HOD already has full per-student attendance detail (Student
  Details modal, Pass unrelated to this one — was already in the codebase).
  Admin has a working but basic endpoint (`GET /admin/attendance`, raw list,
  no dedicated per-student UI). Super Admin has aggregate stats only, no
  per-student drill-down. Closing this gap properly (a real per-student
  attendance view for Admin and Super Admin, matching HOD's) is a real
  chunk of new UI work I'd rather scope explicitly than rush in the same
  pass as everything else above.
9. DB/API integrity (no duplicates, atomic updates) — **partially done this
   pass, see below; not a full line-by-line audit of every collection**

# Pass 7: DB/API integrity — spec item 9

Targeted, not exhaustive — I audited the areas this rebuild touches most
(subjects, schedule, attendance, students) rather than re-auditing the entire
pre-existing codebase from scratch:

- **Duplicate attendance/lectures:** nothing previously stopped a teacher from
  submitting the same lecture twice (double-click, slow network causing a
  retry, accidental re-submit) — each submission just inserted a fresh batch
  of per-student records, silently inflating "Total Lectures" and skewing
  percentages. `POST /api/teacher/attendance` now checks whether this exact
  lecture (teacher + class + subject + division + time + calendar day) was
  already submitted today, and rejects with a clear message pointing to
  Attendance History (Pass 5) to edit it instead.
- **Duplicate subjects:** Admin could previously create "Mathematics" for
  BCA Sem 3 twice with nothing stopping it — two identical entries would then
  both show up in HOD's subject dropdown with no way to tell them apart.
  `POST /api/admin/subjects` now rejects a name that already exists for that
  exact college/department/course/semester.
- **Duplicate students:** there was no check that a roll number is unique
  within its own class. `createStudent()` (used by both HOD's and Admin's
  "add student") now rejects a roll number already in use in that
  college/department/course/semester.
- **Duplicate timetable slots:** already covered by Pass 1's conflict
  detection — two overlapping lectures for the same class, or the same
  teacher double-booked, are rejected at creation/edit time.
- Not re-audited in this pass: Notices, Marks, Syllabus, and College/Department
  admin CRUD — these weren't part of the original spec's feature list and I
  didn't want to touch code outside what was asked without flagging it first.
  Say the word if you'd like a pass over those too.

# On item 8 (cross-role real-time broadcast)

Worth flagging before I build anything here, because it's a real fork in the
road, not just more of the same pattern: everything in Passes 1-7 achieves
sync by having every role read the *same* underlying document (one Student
doc, one User doc, one Schedule collection) — so there's never stale
duplicated data, and any update is instantly correct on that person's next
page load or navigation. What's **not** in place is push-without-reloading —
if a Parent has a dashboard open and HOD changes their child's timetable in
another tab, the Parent's open tab won't update until they navigate or
refresh.

Closing that gap for real means adding actual infrastructure (WebSockets or
Server-Sent Events): a persistent connection per logged-in user, auth over
that connection, and an event emitted from every mutating route across 4
role-based backends, listened for in 5 separate frontends. That's a
meaningfully different, larger piece of work than anything else in this
list, and I'd rather scope it properly with you than guess and build the
wrong thing (e.g. simple polling would be far less code but adds constant
background requests and up-to-~30s lag; a full socket layer is "instant" but
is real new infrastructure to deploy and maintain on EC2). Let me know which
you'd prefer, or if "correct on next reload" is actually fine for now.

# Pass 6: Teacher Profile page — spec item 7

- `GET/PUT /api/teacher/profile` and `POST /api/teacher/profile/photo` — a
  teacher can view and edit their own profile and upload their own photo
  (same data-URI approach and 3MB/JPEG-PNG-WEBP validation as the student
  photo feature). "Existing editable fields only" is enforced server-side: a
  teacher can change `phone`, `emergencyContact`, `qualification`,
  `experience` — not `designation`, `status`, `course`, or `email`, which
  stay HOD/Admin-controlled (edited from HOD → Teacher Details instead).
- Frontend: the sidebar avatar/name (previously not clickable) now opens a
  new "My Profile" page, with the same tap-to-upload + client-side
  canvas-compression pattern used for students.
- Because this is the same `User` document HOD's Teacher List, Teacher
  Details, and Admin's faculty table already read, uploading a photo here
  shows up there automatically — no extra sync code needed, same reasoning
  as the Parent/Student sync in Pass 2.
- Admin's HOD and Teacher tables (`admin/js/data.js`) previously only ever
  rendered initials, never a photo, even though the data has been readable
  the whole time. Added a shared `avatarCell()` helper and wired it into both
  tables (and reused it — no new backend work needed since the data was
  already there).
- Also fixed the sidebar/header avatar in the Teacher Portal (`sidebarAv`,
  `headerAv`) to show the real photo instead of always showing initials.

# Pass 5: Teacher Attendance History + edit-in-place — spec item 4

Attendance was previously stored as one flat document per student per
submission, with no concept of "this batch of N documents is one lecture" —
there was nothing to group by, and nothing to safely edit without either
touching unrelated records or effectively creating a duplicate.

- `Attendance` model: added `division`, `type`, `time` (e.g. `"09:00 - 10:00"`),
  captured at marking time. Added a compound index for the grouping query.
- Rather than adding a new `sessionId` field (which would need a migration to
  backfill on existing data), a lecture's identity is derived — from
  `teacher + course + semester + subject + division + time + calendar day` —
  into a stable, URL-safe key. Two lookups always agree on what "one lecture"
  means: nothing new to trust, no migration needed on your existing data.
- `GET /api/teacher/attendance/history` — one row per lecture ever submitted
  (date, time, subject, course, semester, division, present/absent counts).
- `GET /api/teacher/attendance/session/:key` — full per-student detail for one
  lecture (for "clicking a record opens attendance details").
- `PUT /api/teacher/attendance/session/:key` — edits status on the *existing*
  documents for that exact lecture only. It cannot change the lecture's
  identity (date/subject/class), and it never inserts a new lecture — matches
  your spec's "Lecture #15 remains Lecture #15" requirement exactly, because
  percentages are always computed live from these same documents (nothing
  cached to go stale).
- Frontend: added an "🕘 Attendance History" button on the Mark Attendance
  page, a history list modal, and a session-detail modal with tap-to-toggle
  present/absent + Save.
- Also wired up the Start Time / End Time / Division inputs that already
  existed in the Mark Attendance form's HTML but were never actually read by
  `submitAtt()` — they're now included in the payload so History has
  meaningful time/division data to group and display.
- **Known limitation:** if a teacher teaches the exact same subject to the
  exact same class twice in one calendar day without setting different
  Start Time values, those two lectures will merge into a single History row
  (their attendance data is still individually correct — this only affects
  how the History list groups/displays them). Given most timetables don't
  repeat a subject twice a day, I judged a full time-slot-picker tied to the
  HOD schedule not worth the added complexity for this pass — say the word if
  you'd like that tightened up.

# Pass 4: HOD → Teacher Details (emergency contact + weekly schedule) — spec item 3

- `User` model: added `emergencyContact`. `Schedule` model: added `division`
  (spec asked for "Division (if applicable)" on teacher lecture slots).
- `controllers/common.js`: new `validateMobileNumber()` (required when
  supplied, 10-15 digits, tolerant of spaces/dashes/+country code). Unit
  tested against 7 cases — all pass. Wired into HOD's teacher-update route.
- Replaced the old free-text "Subject" field on the HOD → Teacher Details
  page with a real **Weekly Schedule** section: a day-grouped list of that
  teacher's actual lectures, each add/remove going through the exact same
  Schedule engine built in Pass 1 — same subject-master-list lock, same
  conflict detection, same validation. Nothing new to trust here; it's the
  same code path, just reachable from the teacher's side instead of the
  class's side.
- New endpoint: `POST /api/hod/schedule/slot` — adds a single lecture without
  touching any others (the existing bulk endpoint always wipes-and-replaces
  a whole class's day, which is wrong for "add one lecture to this teacher").
- `GET /api/hod/schedule` now accepts `?teacher=<id>` so the Teacher Details
  page can ask for just one person's timetable.

**Two more pre-existing bugs found and fixed while building this:**
- `GET /api/teacher/schedule` (the endpoint powering the Teacher Portal's own
  "My Schedule" page) was scoped to the teacher's whole *department*, not to
  that specific teacher — every teacher was seeing every other teacher's
  lectures mixed into their own timetable, with a "Mark Attendance" button
  that would have let them mark attendance for classes they don't teach.
  Fixed to filter by `teacher: req.user.id`.
- Separately, and worse: the Teacher Portal's schedule page (`teacher/js/app.js`)
  was reading its timetable from `/auth/me`'s response (`u.timetable`), but
  the `User` model has no `timetable` field and never did — so
  `currentTeacher.timetable` was `{}` on every login, for every teacher, and
  the schedule page always showed "No timetable available" regardless of
  what HOD assigned. The actual schedule data was sitting at
  `/teacher/schedule` the whole time; nothing in the frontend ever called it.
  Fixed: added `TAPI.getSchedule()` and wired it into app.js's bootstrap. Spec
  item 3's "Teacher Portal Timetable... automatically display the HOD
  timetable" requirement was, before this fix, not working at all — this
  wasn't a matter of syncing it better, it was completely disconnected.

---

# Pass 2: Parent accounts + Student↔Parent sync (spec item 1)

Good news first: the hard part — a shared Parent/Student portal that reads
identical data — **already existed** in the codebase. `student.routes.js`
already allowed both `student` and `parent` roles and already resolved
"which student is this?" via `req.user.student` (a field already on the
`User` model). The `student-parent` frontend already whitelisted the
`parent` role in its login guard. Nobody had ever wired up a way to *create*
a parent account, so none of that machinery was reachable — this pass closes
that gap.

- `Student` model: added `parentEmail` (not hard-`required` at the DB level —
  see comment in the model — enforced at the API layer instead, so existing
  student records already in your database don't break on unrelated saves).
- `controllers/common.js`: new `validateParentEmail()` (required, valid
  format, unique, must differ from the student's own email) and
  `syncParentAccount()` (creates/updates a `role: 'parent'` User account
  pointed at the student via the existing `student` field; if the parent
  email is changed later, the old account is detached, not deleted — nothing
  is destroyed, it just stops granting access to that student's data).
- Wired into `createStudent()` (used by both HOD's and Admin's "add student"
  endpoints) and into a new shared `updateStudentAndSyncParent()` (used by
  both PUT `/hod/students/:id` and PUT `/admin/students/:id`), so behavior is
  identical everywhere a student can be created or edited.
- Because Parent and Student literally read the same `Student` document
  through `currentStudent()`, personal info, attendance, semester, branch,
  course, timetable, notices, and photo are automatically identical for both
  — there's only one document, so there's nothing that can drift out of sync.
- Frontend: added the "Parent Email" field (required) to HOD's Add Student
  form and to the Student Details modal (which already had a generic
  edit-and-save mechanism, so this needed one line, not new logic). The Admin
  "Add Student" form already had a `parent-email` input and was already
  sending it to the backend — it just wasn't required or validated client-side
  until now, and the backend was silently ignoring it before this pass.

# Pass 3: Student profile photo upload + cross-role sync (spec item 2)

- `Student` and `User` models: added an `avatar` field (a data URI string,
  e.g. `data:image/jpeg;base64,...`). Deliberately **not** disk/S3-based
  storage: this app needs to run on a plain AWS EC2 instance per your spec,
  and a data-URI-in-MongoDB approach needs zero extra infrastructure (no
  persistent volume assumptions, no S3 bucket/credentials to configure) while
  still satisfying "one image reference, no duplication" — everyone who reads
  that Student/User document sees the same photo automatically.
- `controllers/common.js`: new `validateImageDataUri()` — enforces JPEG/PNG/
  WEBP only and a 3MB cap (checked mathematically from the base64 length, not
  by decoding the whole image). Unit-tested against 8 cases (valid, wrong
  mime, oversized, empty, corrupt, null) — all pass.
- `POST /api/student/profile/photo` — student-only (a linked Parent account
  can view the photo, matching the shared document, but can't change it —
  returns 403 if a parent account calls this).
- Frontend (`student-parent/js/profile.js`): added the upload UI (a small
  pencil badge on the avatar) with client-side compression — the browser
  resizes the image to max 512px and re-encodes as JPEG ~82% quality on a
  `<canvas>` before upload, so a phone photo doesn't ship multiple MB into
  your database. Also updated HOD's student list and Admin's student list to
  render the real photo (previously they only ever showed initials, even
  though HOD's Student *Details* modal already had an `<img>` bound to
  `s.avatar` — the list view was the one place actually missing it).
- **Bug fix (pre-existing, found while working on this exact page):**
  `student-parent/js/profile.js` read `d.data` from the `/student/profile`
  response, but the backend's `ok()` helper doesn't put the flat profile
  there — it's under `d.profile` (and `d.student`). `d.data` was actually the
  wrapper object `{success, student, profile}`. The result: the profile page
  was rendering entirely blank (every field falling back to `—`) for every
  student and parent, on every deployment of this code, regardless of my
  changes. Fixed to read `d.profile` first.
- Not updated in this pass (no display surface currently exists there to
  sync): the sidebar mini-avatar (`app.js`, driven by `/auth/me`, which
  returns the `User` doc — not the `Student` doc the photo lives on) and the
  Dashboard page, and the Super Admin frontend (which only shows
  college-level aggregates, never an individual student). None of these
  currently render a photo at all, for anyone, so there's nothing to "go out
  of sync" — say the word if you'd like photos added to any of them too.


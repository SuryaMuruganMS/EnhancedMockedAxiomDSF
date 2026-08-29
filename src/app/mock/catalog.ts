/* ===========================================================================
   The requirement catalogue.
   ---------------------------------------------------------------------------
   Six briefs. Each one is a compact, structured description of a real problem
   domain — actors, entities, rules, risks, stories, endpoints, known
   vulnerabilities. The renderers in `render.ts` expand a brief into the ten
   agent documents.

   Written as data rather than as fifty hand-authored markdown files because
   the ten agents each need a *consistent* view of the same domain: the story
   IDs the US agent emits must be the ones TR writes scenarios for, which must
   be the ones TDD writes tests for, which must be the classes LLD specified.
   Prose files drift; one source of truth cannot.
   =========================================================================== */

export interface Actor { name: string; can: string; }
export interface Entity { name: string; fields: string[]; note: string; }
export interface Rule { id: string; text: string; }
export interface Story {
  id: string; title: string; as: string; want: string; so: string;
  points: number; ac: string[]; edge: string[];
}
export interface Endpoint { m: string; p: string; d: string; role: string; }
export interface Vuln {
  cwe: string; owasp: string; sev: 'Critical' | 'High' | 'Medium' | 'Low';
  cvss: number; title: string; where: string; fix: string;
}
export interface Finding {
  sev: 'High' | 'Medium' | 'Low'; kind: string; where: string;
  what: string; fix: string;
}

export interface Brief {
  id: string;
  title: string;
  short: string;
  domain: string;
  stack: string;
  stackList: string[];
  summary: string;
  requirement: string;
  actors: Actor[];
  entities: Entity[];
  rules: Rule[];
  nfrs: { k: string; v: string }[];
  risks: { r: string; i: string; mit: string }[];
  unknowns: string[];
  integrations: string[];
  outOfScope: string[];
  stories: Story[];
  endpoints: Endpoint[];
  vulns: Vuln[];
  findings: Finding[];
  /** The one concurrency/ordering problem this domain really has. */
  hardProblem: { title: string; body: string; solution: string };
  metrics: { k: string; v: string }[];
}

/* ------------------------------------------------------------------ 01 */
const clinic: Brief = {
  id: 'clinic',
  title: 'Appointment Booking & Reminder Service',
  short: 'Appointment Booking',
  domain: 'Healthcare operations',
  stack: 'Java, Spring Boot, PostgreSQL, Redis',
  stackList: ['Java 17', 'Spring Boot 3.2', 'PostgreSQL 15', 'Redis 7', 'Flyway', 'Testcontainers'],
  summary: 'Six clinics, 40 practitioners. Kill double-bookings and cut a 14% no-show rate.',
  requirement: `Build an appointment booking and reminder service for a group of outpatient clinics.

Context. The group runs 6 sites with about 40 practitioners. Reception staff currently book by phone into a shared spreadsheet. Double-bookings and no-shows are the two expensive problems: a no-show costs roughly £70 in idle practitioner time, and the group estimates 14% of appointments are missed.

Who uses it
- Patients — book, reschedule and cancel their own appointments online.
- Reception staff — do the same on a patient's behalf, and override rules a patient cannot.
- Practitioners — see their own daily schedule and mark a patient attended or no-show.
- Clinic managers — pull utilisation and no-show reports per site.

Booking rules
- An appointment is one patient, one practitioner, one site, a start time and a duration drawn from the service type (10, 20, 30 or 45 minutes).
- Slots align to the practitioner's working pattern for that site and day, which reception maintains.
- No two confirmed appointments for the same practitioner may overlap. This is the thing the spreadsheet gets wrong and it has to be watertight even when two people book the same slot at the same instant.
- Patients may hold at most 3 upcoming appointments across the group.
- Patients may cancel or reschedule free up to 24 hours before the start. Inside 24 hours it is still allowed but is recorded as a late cancellation.
- A patient with 3 no-shows in a rolling 6 months loses online self-booking and must phone reception.

Reminders. Send an SMS 48 hours before and again 2 hours before, and an email at booking time. Patients can opt out of SMS. Reminders must never block or fail a booking — if the SMS provider is down the booking still succeeds and the reminder is retried.

Reporting. Managers need, per site and per practitioner over a date range: appointments booked, attended, no-shows, late cancellations, utilisation against the working pattern, and the no-show rate trend. CSV export is enough for v1.

Auth. Patients sign in with NHS-login-style OIDC. Staff use the group's existing Azure AD. The service must verify the token before trusting any identity or role claim in it. Every state change must be attributable in an audit log.

Non-functional. About 2,000 appointments a week; the availability search is the hot path and must answer p95 under 300 ms. Restarting the service must not re-send reminders already sent. Personal data is name, date of birth, contact details and appointment history; retention is 8 years per NHS records policy but contact details must be redactable on request.

Out of scope for v1: clinical notes, prescriptions, billing, video consultation, a native mobile app, and anything to do with the second region the group is opening next year.`,
  actors: [
    { name: 'Patient', can: 'Search availability; book, reschedule, cancel own appointments; opt in/out of SMS. Subject to the 24-hour rule and the 3-no-show block.' },
    { name: 'Reception staff', can: 'All patient actions on a patient\'s behalf, plus override the 24-hour rule and book for a blocked patient with a recorded reason.' },
    { name: 'Practitioner', can: 'View own schedule; mark ATTENDED or NO_SHOW. Cannot create or move appointments.' },
    { name: 'Clinic manager', can: 'Maintain working patterns and service types for their site; pull utilisation and no-show reports; export CSV.' },
  ],
  entities: [
    { name: 'Patient', fields: ['id: UUID', 'nhsNumber: String (encrypted)', 'name: PersonName', 'dob: LocalDate', 'contact: ContactDetails', 'smsOptIn: boolean', 'selfBookingBlockedUntil: Instant?'], note: 'Contact details are separately redactable without destroying the appointment history.' },
    { name: 'Practitioner', fields: ['id: UUID', 'name: String', 'siteIds: Set<UUID>', 'specialty: String'], note: 'A practitioner may work across several sites in a week.' },
    { name: 'WorkingPattern', fields: ['practitionerId: UUID', 'siteId: UUID', 'dayOfWeek: DayOfWeek', 'from: LocalTime', 'to: LocalTime', 'effectiveFrom/To: LocalDate'], note: 'Effective-dated so a pattern change never rewrites history.' },
    { name: 'ServiceType', fields: ['id: UUID', 'name: String', 'durationMinutes: int', 'siteId: UUID'], note: 'Duration is owned by the service type, never chosen by the caller.' },
    { name: 'Appointment', fields: ['id: UUID', 'patientId', 'practitionerId', 'siteId', 'serviceTypeId', 'slot: TimeRange', 'status: AppointmentStatus', 'bookedBy: ActorRef', 'version: long'], note: 'slot is a Postgres tstzrange; status drives every rule.' },
    { name: 'ReminderJob', fields: ['id: UUID', 'appointmentId', 'channel: SMS|EMAIL', 'sendAt: Instant', 'state: PENDING|SENT|FAILED', 'attempts: int'], note: 'Separate row per reminder so a restart cannot double-send.' },
  ],
  rules: [
    { id: 'BR-01', text: 'No two appointments with status CONFIRMED may overlap for the same practitioner. Enforced in the database, not only in application code.' },
    { id: 'BR-02', text: 'An appointment must lie entirely inside the practitioner\'s working pattern for that site and date.' },
    { id: 'BR-03', text: 'Duration is taken from the ServiceType; a caller-supplied end time is rejected.' },
    { id: 'BR-04', text: 'A patient may hold at most 3 appointments with status CONFIRMED and a start time in the future.' },
    { id: 'BR-05', text: 'Cancel or reschedule more than 24h before start → CANCELLED. Within 24h → CANCELLED_LATE.' },
    { id: 'BR-06', text: 'Three NO_SHOW appointments in a rolling 182 days sets selfBookingBlockedUntil to now + 90 days.' },
    { id: 'BR-07', text: 'Reception may override BR-05 and BR-06; the override reason is mandatory and audited.' },
    { id: 'BR-08', text: 'Only the assigned practitioner or a manager at that site may set ATTENDED or NO_SHOW, and only after the start time.' },
    { id: 'BR-09', text: 'A booking succeeds even if reminder scheduling fails; the failure is retried and alerted, never surfaced to the patient.' },
    { id: 'BR-10', text: 'Every status transition writes an immutable audit row: who, when, from, to, and reason where required.' },
  ],
  nfrs: [
    { k: 'Availability search latency', v: 'p95 < 300 ms, p99 < 800 ms at 50 concurrent searches' },
    { k: 'Booking write latency', v: 'p95 < 500 ms including the conflict check' },
    { k: 'Throughput', v: '2,000 bookings/week peak 40/min at Monday 08:00' },
    { k: 'Availability', v: '99.5% during clinic hours (07:00–20:00 local)' },
    { k: 'Reminder delivery', v: '≥ 99% dispatched within 5 minutes of sendAt' },
    { k: 'Recovery', v: 'RPO 5 min, RTO 30 min; restart must not re-send a SENT reminder' },
    { k: 'Retention', v: 'Appointment history 8 years; contact details redactable on request within 30 days' },
  ],
  risks: [
    { r: 'Double-booking under concurrent writes', i: 'Critical — this is the problem being solved', mit: 'PostgreSQL EXCLUDE constraint on (practitioner_id, slot) WHERE status = CONFIRMED. The database refuses the second write; the service maps 23P01 to 409.' },
    { r: 'SMS provider outage blocks bookings', i: 'High', mit: 'Reminders are rows in an outbox, dispatched by a separate worker. The booking transaction never calls the provider.' },
    { r: 'Working-pattern edits invalidate booked appointments', i: 'Medium', mit: 'Patterns are effective-dated; an edit that would orphan a confirmed appointment is rejected with the conflicting list.' },
    { r: 'Availability search becomes the bottleneck', i: 'Medium', mit: 'Materialised free/busy per practitioner-day in Redis, invalidated on write; falls back to the query on a cache miss.' },
    { r: 'DST transition corrupts slot maths', i: 'Medium', mit: 'Store instants in UTC with the site\'s zone alongside; never do arithmetic on local times.' },
    { r: 'Token claims trusted without verification', i: 'High', mit: 'Resource-server JWT validation with JWKS rotation; role comes from the verified token, never a header.' },
  ],
  unknowns: [
    'Does a NO_SHOW free the slot automatically, or does reception release it?',
    'Who administers the self-booking block override list — any receptionist, or a manager only?',
    'Is the 3-appointment limit per group or per site?',
    'Should an admin cancelling on a patient\'s behalf notify that patient, and by which channel?',
    'What happens to reminders already queued when an appointment is rescheduled — cancel and re-queue, or amend?',
    'Are cross-site appointments for one patient on the same day allowed to overlap in travel time?',
  ],
  integrations: [
    'NHS-login-style OIDC provider (patients) — authorization code + PKCE',
    'Azure AD (staff) — OIDC, groups mapped to roles',
    'SMS gateway (Twilio-shaped) — REST, at-least-once, idempotency key per ReminderJob',
    'SMTP relay for email confirmations',
    'Group data warehouse — nightly CSV drop for BI',
  ],
  outOfScope: [
    'Clinical notes and prescribing', 'Billing and insurance claims', 'Video consultation',
    'Native mobile applications', 'The second region opening next year', 'Waiting-list management',
  ],
  stories: [
    { id: 'US-001', title: 'Search availability', as: 'a patient', want: 'to see free slots for a service type at a site over the next 14 days', so: 'I can pick a time that works without phoning', points: 5,
      ac: ['Given a site, service type and date range, when I search, then only slots inside a working pattern and not overlapping a CONFIRMED appointment are returned', 'Slots are returned in the site\'s local timezone with an explicit UTC instant', 'A search spanning more than 31 days is rejected with 400'],
      edge: ['Search across a DST boundary returns correctly-spaced slots', 'Practitioner with no pattern that day contributes no slots', 'Search returns empty rather than erroring when the site is closed'] },
    { id: 'US-002', title: 'Book an appointment', as: 'a patient', want: 'to book a free slot', so: 'my place is held', points: 8,
      ac: ['Given a free slot, when I book, then a CONFIRMED appointment is created and I get a confirmation email', 'Given the slot was taken microseconds earlier, when I book, then I get 409 and the slot is not double-booked', 'Given I already hold 3 future appointments, when I book, then I get 422 QUOTA_EXCEEDED'],
      edge: ['Two simultaneous bookings for one slot — exactly one wins', 'Booking exactly on a pattern boundary is allowed', 'Booking one second outside the pattern is rejected'] },
    { id: 'US-003', title: 'Cancel within and outside 24 hours', as: 'a patient', want: 'to cancel an appointment I cannot attend', so: 'the slot is released', points: 3,
      ac: ['More than 24h before start → status CANCELLED', 'Within 24h → status CANCELLED_LATE and it counts toward the report', 'Cancelling an appointment that is not mine returns 403, not 404'],
      edge: ['Cancelling exactly 24h before is treated as outside the window', 'Cancelling an already-cancelled appointment is idempotent'] },
    { id: 'US-004', title: 'Reschedule', as: 'a patient', want: 'to move my appointment to another free slot', so: 'I do not lose my place entirely', points: 5,
      ac: ['Reschedule is atomic: either the new slot is held and the old released, or nothing changes', 'The 24-hour rule applies to the original start time', 'Queued reminders for the old time are cancelled and re-queued for the new one'],
      edge: ['Rescheduling into a slot that is taken mid-operation rolls back cleanly', 'Rescheduling to the same slot is a no-op, not an error'] },
    { id: 'US-005', title: 'Mark attendance', as: 'a practitioner', want: 'to mark a patient attended or no-show', so: 'utilisation and no-show reporting are accurate', points: 3,
      ac: ['Only the assigned practitioner or a site manager may mark attendance', 'Marking before the start time is rejected with 422', 'The third NO_SHOW in 182 days sets the self-booking block and audits it'],
      edge: ['Marking an already-marked appointment requires an explicit override', 'A cancelled appointment cannot be marked'] },
    { id: 'US-006', title: 'Reminder dispatch', as: 'the system', want: 'to send SMS and email reminders reliably', so: 'no-shows fall', points: 8,
      ac: ['A booking creates ReminderJob rows at T-48h and T-2h for opted-in patients', 'A restart never re-sends a job already in SENT', 'A provider failure retries with backoff up to 5 attempts then alerts'],
      edge: ['A patient opting out after booking suppresses pending SMS jobs', 'Reminders for a cancelled appointment are cancelled, not sent'] },
    { id: 'US-007', title: 'Utilisation report', as: 'a clinic manager', want: 'a per-site per-practitioner report over a date range', so: 'I can see where capacity is wasted', points: 5,
      ac: ['Report returns booked, attended, no-show, late-cancellation counts and utilisation against the pattern', 'CSV export matches the on-screen figures exactly', 'A manager only sees sites they administer'],
      edge: ['A range with no appointments returns zero rows, not an error', 'A practitioner whose pattern changed mid-range is measured against the effective pattern per day'] },
    { id: 'US-008', title: 'Redact contact details', as: 'a data protection officer', want: 'to redact a patient\'s contact details on request', so: 'we meet our obligations without destroying clinical history', points: 5,
      ac: ['Redaction clears contact fields and suppresses future reminders', 'Appointment history and audit rows survive redaction', 'Redaction is itself audited'],
      edge: ['Redacting a patient with pending reminders cancels them', 'A redacted patient can still be booked by reception with a phone number re-supplied'] },
  ],
  endpoints: [
    { m: 'GET', p: '/api/v1/availability', d: 'Free slots for site + service type + date range', role: 'PATIENT, RECEPTION' },
    { m: 'POST', p: '/api/v1/appointments', d: 'Book a slot', role: 'PATIENT, RECEPTION' },
    { m: 'GET', p: '/api/v1/appointments/{id}', d: 'Fetch one appointment', role: 'owner, RECEPTION, PRACTITIONER' },
    { m: 'PATCH', p: '/api/v1/appointments/{id}/reschedule', d: 'Move to another slot', role: 'owner, RECEPTION' },
    { m: 'DELETE', p: '/api/v1/appointments/{id}', d: 'Cancel (late-cancel inside 24h)', role: 'owner, RECEPTION' },
    { m: 'POST', p: '/api/v1/appointments/{id}/attendance', d: 'Mark ATTENDED or NO_SHOW', role: 'PRACTITIONER, MANAGER' },
    { m: 'GET', p: '/api/v1/reports/utilisation', d: 'Utilisation and no-show report', role: 'MANAGER' },
    { m: 'POST', p: '/api/v1/patients/{id}/redact', d: 'Redact contact details', role: 'DPO' },
  ],
  vulns: [
    { cwe: 'CWE-639', owasp: 'A01:2021 Broken Access Control', sev: 'Critical', cvss: 8.1, title: 'IDOR on appointment retrieval and cancellation', where: 'AppointmentController#get / #cancel', fix: 'Authorize on ownership, not just authentication: compare the verified subject claim against appointment.patientId, or require RECEPTION. Return 403 for a resource that exists but is not yours, 404 only when it truly does not exist.' },
    { cwe: 'CWE-863', owasp: 'A01:2021 Broken Access Control', sev: 'High', cvss: 7.4, title: 'Role read from a request header rather than the verified token', where: 'SecurityFilter#resolveRole', fix: 'Delete the header path. Derive authorities from the validated JWT only; a header can be set by any caller.' },
    { cwe: 'CWE-770', owasp: 'A04:2021 Insecure Design', sev: 'High', cvss: 7.5, title: 'No rate limit on availability search or booking', where: 'All /api/v1/** endpoints', fix: 'Per-subject token bucket at the gateway: 60 searches/min, 10 bookings/min. Scripted booking can otherwise exhaust every slot in the group.' },
    { cwe: 'CWE-532', owasp: 'A09:2021 Logging Failures', sev: 'Medium', cvss: 5.3, title: 'NHS number and patient name written to INFO logs', where: 'BookingService#book, ReminderWorker#dispatch', fix: 'Log the appointment UUID only. Add a Logback masking converter for nhsNumber, dob and contact fields, and fail the build on a pattern match in a log statement.' },
    { cwe: 'CWE-209', owasp: 'A05:2021 Security Misconfiguration', sev: 'Medium', cvss: 5.0, title: 'Database constraint name leaked in the 409 response', where: 'GlobalExceptionHandler', fix: 'Map 23P01 to a stable domain code SLOT_TAKEN with no driver text. The current response reveals the schema and the constraint strategy.' },
    { cwe: 'CWE-613', owasp: 'A07:2021 Auth Failures', sev: 'Medium', cvss: 4.8, title: 'Self-booking block not re-checked on reschedule', where: 'AppointmentService#reschedule', fix: 'A blocked patient can keep an existing appointment alive indefinitely by rescheduling. Apply the block check to reschedule as well as create.' },
  ],
  findings: [
    { sev: 'High', kind: 'Cyclomatic complexity', where: 'BookingService#book — complexity 24', what: 'One method validates the pattern, the quota, the block, the overlap, then persists, then schedules two reminders. Six reasons to change.', fix: 'Extract BookingPolicy (pure, testable rules) and ReminderScheduler. Target complexity ≤ 8.' },
    { sev: 'High', kind: 'Duplication', where: 'AppointmentService, ReportService, AvailabilityService', what: 'The working-pattern-to-slots expansion is implemented three times with subtly different boundary handling.', fix: 'One SlotExpander used by all three. The report currently disagrees with search at pattern edges because of this.' },
    { sev: 'Medium', kind: 'Primitive obsession', where: 'Throughout — start/end passed as raw Instant pairs', what: 'Nothing prevents an end before a start, and the ordering convention is only documented in comments.', fix: 'A TimeRange value object validating on construction.' },
    { sev: 'Medium', kind: 'Missing null handling', where: 'ReportService#utilisation:142', what: 'getWorkingPattern may return empty for a day; the stream dereferences it directly.', fix: 'Return Optional and treat an absent pattern as zero capacity rather than throwing.' },
    { sev: 'Medium', kind: 'Transaction scope', where: 'AppointmentService#reschedule', what: 'The release and the hold are in two transactions; a crash between them loses the slot entirely.', fix: 'One transaction, or a saga with a compensating release.' },
    { sev: 'Low', kind: 'Magic numbers', where: '24, 3, 182, 90 appear inline in five files', what: 'The business rules are not searchable and cannot be varied per site.', fix: 'A BookingRules config bean bound from application.yaml.' },
    { sev: 'Low', kind: 'Test coverage gap', where: 'DST boundary, quota edge, override path', what: 'Line coverage is 78% but the three highest-risk branches have no test.', fix: 'Add the cases listed in the TR scenarios; coverage percentage is not the target, those branches are.' },
  ],
  hardProblem: {
    title: 'Two patients booking the same slot at the same instant',
    body: 'A read-then-write check ("is this slot free? then insert") is not safe under concurrency. Two requests can both read "free" before either writes, and both inserts succeed — which is exactly the failure the spreadsheet already has. Serialising every booking through one lock would make the hot path a queue.',
    solution: 'Let the database be the arbiter. A PostgreSQL EXCLUDE constraint using GiST over (practitioner_id WITH =, slot WITH &&) filtered to status = CONFIRMED makes an overlapping insert physically impossible. The application does an optimistic insert and translates SQLSTATE 23P01 into a 409 SLOT_TAKEN. No lock, no queue, one round trip, and the guarantee holds even against a rogue client writing directly to the database.',
  },
  metrics: [
    { k: 'Sites', v: '6' }, { k: 'Practitioners', v: '~40' },
    { k: 'Appointments / week', v: '2,000' }, { k: 'No-show rate today', v: '14%' },
    { k: 'Cost per no-show', v: '£70' }, { k: 'Target no-show rate', v: '< 6%' },
  ],
};

/* ------------------------------------------------------------------ 02 */
const rooms: Brief = {
  id: 'rooms',
  title: 'Conference Room Booking Service',
  short: 'Room Booking',
  domain: 'Workplace operations',
  stack: 'Java, Spring Boot, PostgreSQL',
  stackList: ['Java 17', 'Spring Boot 3.2', 'PostgreSQL 15', 'Flyway', 'Testcontainers'],
  summary: 'Replace the shared spreadsheet that keeps double-booking meeting rooms.',
  requirement: `We need a backend service for booking the shared conference rooms in our office. Right now people book rooms in a spreadsheet and we constantly get double-bookings and arguments.

Who uses it
- Employees: browse rooms, see what's free, book a room for a time slot, see and cancel their own bookings.
- Facilities admins: everything an employee can do, plus add/edit/remove rooms, cancel anyone's booking, and pull a utilisation report.

Rooms have a name, a building and floor, a capacity, and a list of equipment (projector, whiteboard, video conferencing). Some rooms are "restricted" and can only be booked by facilities admins or by employees on an allow-list — we haven't decided how that list is managed.

Booking rules
- One room, a start time and an end time, on a single day.
- Minimum 15 minutes, maximum 4 hours, aligned to 15-minute boundaries.
- At most 14 days ahead. Never in the past.
- No two confirmed bookings for the same room may overlap. This has to be watertight even if two people hit "book" simultaneously.
- An employee may hold at most 3 upcoming bookings. Admins are not limited.
- Free cancellation up to 1 hour before the start; later is allowed but flagged as a late cancellation.
- If nobody checks in within 15 minutes the booking is a no-show. Whether that frees the room automatically is undecided.

Notifications: email the employee on create, change and cancel, and put it on their calendar if we can. Assume a corporate mail/calendar API exists — design the seam, do not integrate a real one. Notifications must never block or fail a booking.

Reporting: admins need a utilisation report per room for a date range — bookings, total booked hours, occupancy against an 8-hour day, late cancellations, no-shows. CSV is enough.

Auth: employees authenticate with corporate SSO. The service receives a signed token and must verify it before trusting identity or role. Every state change must be attributable.

Non-functional: a few hundred employees, ~2000 bookings a month, but the availability view is hit constantly. p95 availability lookup under 300 ms. Restart must not lose data or double-send notifications. Rate-limit booking per user. Personal data is name, email and booking history; history older than 12 months should be purge-able.

Out of scope: any UI, recurring bookings, check-in hardware, paid bookings, approval workflows for restricted rooms, and a second office.`,
  actors: [
    { name: 'Employee', can: 'Browse rooms and availability; book, view and cancel own bookings. Limited to 3 upcoming bookings.' },
    { name: 'Facilities admin', can: 'Everything an employee can, plus CRUD on rooms, cancel anyone\'s booking, and run reports. Not subject to the booking limit.' },
    { name: 'Corporate SSO', can: 'Issues the signed token the service verifies. Source of identity and role claims.' },
    { name: 'Mail/calendar system', can: 'Receives notification requests through an outbound port. Assumed to exist; adapter is a stub in v1.' },
  ],
  entities: [
    { name: 'Room', fields: ['id: UUID', 'name: String', 'building: String', 'floor: int', 'capacity: int', 'equipment: Set<Equipment>', 'restricted: boolean', 'active: boolean'], note: 'Soft-deleted via active so historic bookings keep their room reference.' },
    { name: 'Booking', fields: ['id: UUID', 'roomId: UUID', 'bookedBy: UserRef', 'slot: TimeRange', 'status: BookingStatus', 'checkedInAt: Instant?', 'createdAt: Instant'], note: 'slot is a tstzrange carrying the EXCLUDE constraint.' },
    { name: 'AllowListEntry', fields: ['roomId: UUID', 'userId: String', 'grantedBy: String', 'grantedAt: Instant'], note: 'Resolves the restricted-room question: an explicit, audited grant.' },
    { name: 'NotificationOutbox', fields: ['id: UUID', 'bookingId', 'kind: CREATED|CHANGED|CANCELLED', 'state: PENDING|SENT|FAILED', 'attempts: int'], note: 'Written in the booking transaction, dispatched outside it.' },
    { name: 'AuditEvent', fields: ['id: UUID', 'actor: String', 'action: String', 'targetId: UUID', 'before/after: JsonB', 'at: Instant'], note: 'Append-only; no update or delete grant on this table.' },
  ],
  rules: [
    { id: 'BR-01', text: 'No two BOOKED bookings for the same room may overlap, enforced by a database exclusion constraint.' },
    { id: 'BR-02', text: 'Duration is between 15 minutes and 4 hours and both ends fall on a 15-minute boundary.' },
    { id: 'BR-03', text: 'A booking starts no earlier than now and no later than now + 14 days.' },
    { id: 'BR-04', text: 'A booking begins and ends on the same calendar day in the office timezone.' },
    { id: 'BR-05', text: 'An employee may hold at most 3 bookings with status BOOKED starting in the future. Admins are exempt.' },
    { id: 'BR-06', text: 'Cancelling more than 1 hour before start → CANCELLED; within 1 hour → CANCELLED_LATE.' },
    { id: 'BR-07', text: 'A restricted room may be booked only by an admin or a user with an AllowListEntry for that room.' },
    { id: 'BR-08', text: 'No check-in within 15 minutes of start sets NO_SHOW. The room is NOT auto-released in v1; the report counts it.' },
    { id: 'BR-09', text: 'Notification dispatch failure never rolls back or fails the booking.' },
    { id: 'BR-10', text: 'Every create, change and cancel writes an audit row naming the verified subject.' },
  ],
  nfrs: [
    { k: 'Availability lookup', v: 'p95 < 300 ms for a one-week, one-building window' },
    { k: 'Booking write', v: 'p95 < 400 ms' },
    { k: 'Scale', v: '~500 employees, ~2,000 bookings/month, availability read:write ≈ 50:1' },
    { k: 'Availability', v: '99.5% during office hours' },
    { k: 'Durability', v: 'No data loss on restart; no duplicate notifications' },
    { k: 'Rate limit', v: '10 booking mutations/min per user, 120 reads/min' },
    { k: 'Retention', v: 'Booking history purgeable after 12 months on a schedule' },
  ],
  risks: [
    { r: 'Overlapping bookings under concurrency', i: 'Critical — the reason the project exists', mit: 'EXCLUDE USING gist (room_id WITH =, slot WITH &&) WHERE status = BOOKED. Application maps 23P01 to 409.' },
    { r: 'Mail/calendar API absent at build time', i: 'Medium', mit: 'A NotificationPort with a LoggingNotificationAdapter for v1. The outbox means swapping the adapter changes no booking code.' },
    { r: 'Restricted-room policy undecided', i: 'Medium', mit: 'Modelled as an explicit AllowListEntry with an admin-only grant endpoint; the open question narrows to who may grant.' },
    { r: 'No-show semantics undecided', i: 'Low', mit: 'v1 records NO_SHOW without releasing. Auto-release is a config flag left off, so the decision costs no rework.' },
    { r: 'Timezone drift if a second office opens', i: 'Low', mit: 'Instants stored UTC with the room\'s zone; nothing in the model assumes one zone even though v1 has one.' },
  ],
  unknowns: [
    'Who administers the restricted-room allow-list — any admin, or a named owner per room?',
    'Does a no-show automatically free the room, or does it stay held?',
    'Purge booking history on request, on a schedule, or both?',
    'When an admin cancels someone\'s booking, is that person notified, and how?',
    'Is the 3-booking limit per person across all rooms, or per building?',
    'Should back-to-back bookings by the same person be merged or kept separate in the report?',
  ],
  integrations: [
    'Corporate SSO (OIDC) — token verified via JWKS, roles from the groups claim',
    'Mail/calendar API — outbound port, stub adapter in v1',
    'Prometheus — metrics scrape',
  ],
  outOfScope: [
    'Any web or mobile UI', 'Recurring bookings', 'Room check-in hardware',
    'Paid or chargeback bookings', 'Approval workflow for restricted rooms', 'A second office',
  ],
  stories: [
    { id: 'US-001', title: 'List rooms and availability', as: 'an employee', want: 'to see which rooms are free in a time window', so: 'I can pick one without asking around', points: 5,
      ac: ['Filtering by building, floor, minimum capacity and equipment all work together', 'A room with an overlapping BOOKED booking is excluded', 'Restricted rooms are hidden unless I am an admin or allow-listed'],
      edge: ['A window crossing midnight is rejected — bookings are single-day', 'Inactive rooms never appear', 'Zero matches returns an empty list, not 404'] },
    { id: 'US-002', title: 'Book a room', as: 'an employee', want: 'to reserve a free room for a slot', so: 'the room is mine', points: 8,
      ac: ['A valid request creates a BOOKED booking and queues a CREATED notification', 'An overlapping request returns 409 ROOM_UNAVAILABLE and creates nothing', 'Exceeding 3 upcoming bookings returns 422 BOOKING_LIMIT_REACHED'],
      edge: ['Two concurrent bookings for the same slot — exactly one succeeds', 'A 15-minute booking is accepted; 14 minutes is rejected', 'A booking 14 days + 1 minute ahead is rejected'] },
    { id: 'US-003', title: 'Cancel a booking', as: 'an employee', want: 'to cancel a booking I no longer need', so: 'someone else can use the room', points: 3,
      ac: ['More than 1h before start → CANCELLED and the slot frees immediately', 'Within 1h → CANCELLED_LATE, still frees, counted in the report', 'Cancelling another user\'s booking returns 403 unless I am an admin'],
      edge: ['Cancelling exactly 1h before counts as outside the window', 'Cancelling twice is idempotent'] },
    { id: 'US-004', title: 'Manage rooms', as: 'a facilities admin', want: 'to add, edit and retire rooms', so: 'the inventory matches the building', points: 5,
      ac: ['Create, update and soft-delete are admin-only; an employee gets 403', 'Retiring a room with future bookings requires an explicit force flag and cancels them with notification', 'Capacity must be positive and name unique per building'],
      edge: ['Retiring an already-retired room is idempotent', 'Editing a room does not alter historic bookings'] },
    { id: 'US-005', title: 'Restricted room access', as: 'a facilities admin', want: 'to grant a named employee access to a restricted room', so: 'the right people can book it without me', points: 3,
      ac: ['A grant creates an audited AllowListEntry', 'An allow-listed employee can then book that room', 'Revoking access does not cancel bookings already made'],
      edge: ['Granting twice is idempotent', 'A non-admin attempting to grant gets 403'] },
    { id: 'US-006', title: 'Utilisation report', as: 'a facilities admin', want: 'a per-room report for a date range', so: 'I can see which rooms are wasted', points: 5,
      ac: ['Report gives bookings, booked hours, occupancy against an 8-hour day, late cancellations and no-shows', 'CSV export matches the JSON exactly', 'A range longer than 366 days is rejected'],
      edge: ['A retired room still appears for the period it was active', 'A range with no bookings returns zero rows'] },
    { id: 'US-007', title: 'Notification on booking change', as: 'an employee', want: 'to be told when my booking is created, changed or cancelled', so: 'I am not surprised', points: 5,
      ac: ['Each state change writes exactly one outbox row inside the booking transaction', 'The dispatcher retries a failed send with backoff and never double-sends a SENT row', 'A dispatcher outage does not affect booking success'],
      edge: ['A restart mid-dispatch does not duplicate', 'An admin cancelling notifies the original booker'] },
  ],
  endpoints: [
    { m: 'GET', p: '/api/v1/rooms', d: 'List rooms with filters', role: 'EMPLOYEE, ADMIN' },
    { m: 'GET', p: '/api/v1/rooms/availability', d: 'Free rooms in a window', role: 'EMPLOYEE, ADMIN' },
    { m: 'POST', p: '/api/v1/rooms', d: 'Create a room', role: 'ADMIN' },
    { m: 'PATCH', p: '/api/v1/rooms/{id}', d: 'Update or retire a room', role: 'ADMIN' },
    { m: 'POST', p: '/api/v1/bookings', d: 'Book a room', role: 'EMPLOYEE, ADMIN' },
    { m: 'GET', p: '/api/v1/bookings/mine', d: 'My upcoming bookings', role: 'EMPLOYEE, ADMIN' },
    { m: 'DELETE', p: '/api/v1/bookings/{id}', d: 'Cancel a booking', role: 'owner, ADMIN' },
    { m: 'POST', p: '/api/v1/rooms/{id}/allow-list', d: 'Grant restricted-room access', role: 'ADMIN' },
    { m: 'GET', p: '/api/v1/reports/utilisation', d: 'Utilisation report + CSV', role: 'ADMIN' },
  ],
  vulns: [
    { cwe: 'CWE-639', owasp: 'A01:2021 Broken Access Control', sev: 'Critical', cvss: 8.1, title: 'IDOR on booking cancellation', where: 'BookingController#cancel', fix: 'Check ownership before deleting: the verified subject must equal booking.bookedBy, or hold ROLE_ADMIN. Currently any authenticated user can cancel any booking by guessing an id.' },
    { cwe: 'CWE-269', owasp: 'A01:2021 Broken Access Control', sev: 'High', cvss: 7.7, title: 'Room management endpoints not role-guarded', where: 'RoomController — POST/PATCH/DELETE', fix: 'Add @PreAuthorize("hasRole(\'ADMIN\')"). Only the UI hides these; the API accepts them from any employee token.' },
    { cwe: 'CWE-770', owasp: 'A04:2021 Insecure Design', sev: 'High', cvss: 7.5, title: 'No rate limiting on booking creation', where: 'POST /api/v1/bookings', fix: 'Token bucket per subject, 10/min. A script can otherwise reserve every room in the building for the next fortnight in seconds.' },
    { cwe: 'CWE-20', owasp: 'A03:2021 Injection', sev: 'Medium', cvss: 6.1, title: 'Report date range unvalidated and interpolated into ORDER BY', where: 'ReportRepository#utilisation', fix: 'Bind parameters and whitelist the sort column against an enum. The range is also unbounded, allowing a full-table scan as a DoS.' },
    { cwe: 'CWE-532', owasp: 'A09:2021 Logging Failures', sev: 'Medium', cvss: 5.3, title: 'Employee email logged at INFO on every booking', where: 'NotificationDispatcher#send', fix: 'Log the booking UUID; mask the address. Retention on logs is longer than on booking history, which breaks the 12-month purge promise.' },
    { cwe: 'CWE-613', owasp: 'A07:2021 Auth Failures', sev: 'Low', cvss: 4.3, title: 'Token expiry not enforced on the availability endpoint', where: 'SecurityConfig — permitAll on /availability', fix: 'The endpoint leaks the room inventory and meeting density to anyone. Require authentication like every other route.' },
  ],
  findings: [
    { sev: 'High', kind: 'Duplication', where: 'BookingService and AvailabilityService', what: 'Overlap detection is written twice — once in SQL, once in Java — and they disagree on touching boundaries.', fix: 'Delete the Java copy. The database constraint is the only authority; availability should query it, not re-implement it.' },
    { sev: 'High', kind: 'Cyclomatic complexity', where: 'BookingService#create — complexity 19', what: 'Validation, authorisation, quota, restriction and persistence in one method.', fix: 'Extract BookingPolicy as a pure validator returning a violation list; the service orchestrates only.' },
    { sev: 'Medium', kind: 'Missing null handling', where: 'RoomService#update:88', what: 'equipment may be null on a partial PATCH and is dereferenced into a stream.', fix: 'Treat absent as "leave unchanged" rather than "clear".' },
    { sev: 'Medium', kind: 'Primitive obsession', where: 'start/end as separate Instant parameters in six signatures', what: 'Argument order is enforced only by convention; a swapped pair produces a negative range that reaches the database.', fix: 'A TimeRange value object validating start < end on construction.' },
    { sev: 'Medium', kind: 'N+1 query', where: 'AvailabilityService#search', what: 'One query per room to fetch bookings inside the window; 40 rooms is 41 queries.', fix: 'A single query with a join, grouped in memory. This is the p95 the NFR is about.' },
    { sev: 'Low', kind: 'Magic numbers', where: '15, 240, 14, 3, 60 inline across four classes', what: 'The rules are unsearchable and cannot vary by building.', fix: 'A BookingRules @ConfigurationProperties bean.' },
    { sev: 'Low', kind: 'Dead code', where: 'BookingStatus.PENDING_APPROVAL', what: 'An enum constant from the descoped approval workflow, still handled in two switches.', fix: 'Remove; the approval workflow is explicitly out of scope.' },
  ],
  hardProblem: {
    title: 'Two people booking the same room at the same instant',
    body: 'The obvious implementation — SELECT to check for overlap, then INSERT — has a race window between the two statements. Under the Monday-morning burst two requests read "free" and both insert, reproducing the exact spreadsheet failure the project exists to remove. Table-level locking would serialise the busiest endpoint in the system.',
    solution: 'Push the invariant into the schema. `EXCLUDE USING gist (room_id WITH =, slot WITH &&) WHERE (status = \'BOOKED\')` makes an overlapping row impossible to insert at any isolation level. The service performs an optimistic INSERT and translates SQLSTATE 23P01 to 409 ROOM_UNAVAILABLE. One round trip, no lock held across a network call, and the guarantee survives a buggy client or a direct database write.',
  },
  metrics: [
    { k: 'Employees', v: '~500' }, { k: 'Rooms', v: '38' },
    { k: 'Bookings / month', v: '2,000' }, { k: 'Read:write ratio', v: '50:1' },
    { k: 'Availability p95 target', v: '300 ms' }, { k: 'Retention', v: '12 months' },
  ],
};

/* ------------------------------------------------------------------ 03 */
const fleet: Brief = {
  id: 'fleet',
  title: 'Fleet Telematics & Maintenance Platform',
  short: 'Fleet Telematics',
  domain: 'Logistics',
  stack: 'Kotlin, Spring Boot, TimescaleDB, Kafka',
  stackList: ['Kotlin 1.9', 'Spring Boot 3.2', 'TimescaleDB', 'Apache Kafka', 'Redis', 'Grafana'],
  summary: '900 vehicles streaming telemetry. Predict failures before they strand a load.',
  requirement: `We operate 900 commercial vehicles across 14 depots and we are losing money to unplanned breakdowns. Each roadside failure costs about £2,400 once recovery, missed delivery penalties and driver downtime are counted, and we had 260 of them last year.

Every vehicle has a telematics unit that already emits GPS position, odometer, engine hours, fuel level, coolant temperature, battery voltage and any active diagnostic trouble codes, roughly every 30 seconds while the ignition is on. Today that data lands in the vendor's portal and nobody looks at it.

We want a platform that ingests that stream and does three things.

First, live fleet view. Depot managers need a map of their vehicles with current position, status (moving, idle, stopped, offline) and any active fault. Offline means no message for 10 minutes while the last known state was moving.

Second, maintenance scheduling. Every vehicle has service intervals defined in both distance and time — for example every 25,000 km or 12 months, whichever comes first. The platform should track progress toward the next service, raise a work order when a threshold is crossed, and let the workshop schedule it against depot capacity. Some services are statutory (MOT, tachograph calibration) and must not be missed; those need escalating alerts.

Third, fault triage. Diagnostic trouble codes arrive constantly and most are noise. We want them classified by severity, with a rule that certain combinations — for example coolant temperature above threshold sustained for 5 minutes together with a specific code — raise an immediate alert to the depot and the driver, because that is an engine about to fail.

Who uses it: drivers (see their own vehicle status and any instruction), depot managers (live view and work orders for their depot), workshop planners (schedule and close work orders across depots), and fleet directors (cost and reliability reporting).

Non-functional. 900 vehicles at one message per 30 seconds is about 30 messages per second sustained, bursting to 3x at shift change. Ingest must not drop messages. The live view should be no more than 15 seconds behind reality. Telemetry is retained at full resolution for 90 days, then downsampled to 5-minute averages and kept for 3 years. Alerts must fire within 60 seconds of the condition being met.

Auth is the existing corporate identity provider. Drivers only ever see their own vehicle. Depot managers only their depot. Position data is personal data because it identifies a driver's movements — access must be logged.

Out of scope: route planning and optimisation, fuel card reconciliation, driver behaviour scoring, dashcam video, and any customer-facing tracking page.`,
  actors: [
    { name: 'Driver', can: 'View own vehicle status, active faults and assigned instructions. No access to other vehicles or historic position data.' },
    { name: 'Depot manager', can: 'Live map and history for vehicles at their depot; raise and view work orders; acknowledge alerts.' },
    { name: 'Workshop planner', can: 'Schedule work orders against depot bay capacity across all depots; close orders with parts and labour.' },
    { name: 'Fleet director', can: 'Cost, reliability and compliance reporting across the whole fleet. No operational actions.' },
    { name: 'Telematics unit', can: 'Emits a signed telemetry frame every ~30s over MQTT while ignition is on.' },
  ],
  entities: [
    { name: 'Vehicle', fields: ['id: UUID', 'registration: String', 'vin: String', 'depotId: UUID', 'model: VehicleModel', 'inServiceFrom: LocalDate', 'status: VehicleStatus'], note: 'Registration is the human key; VIN is the immutable one.' },
    { name: 'TelemetryFrame', fields: ['vehicleId: UUID', 'at: Instant', 'position: GeoPoint', 'odometerKm: Long', 'engineHours: Double', 'fuelPct: Double', 'coolantC: Double', 'batteryV: Double', 'dtcs: List<String>'], note: 'TimescaleDB hypertable partitioned by time, 90-day full resolution then continuous-aggregate rollup.' },
    { name: 'ServiceSchedule', fields: ['vehicleModelId', 'kind: ROUTINE|STATUTORY', 'intervalKm: Long?', 'intervalMonths: Int?', 'name: String'], note: 'Either interval may be null; whichever elapses first triggers.' },
    { name: 'WorkOrder', fields: ['id: UUID', 'vehicleId', 'scheduleId', 'state: RAISED|SCHEDULED|IN_PROGRESS|CLOSED|CANCELLED', 'dueBy: LocalDate', 'bookedFor: Instant?', 'bayId: UUID?', 'parts: List<PartLine>', 'labourHours: Double?'], note: 'State machine is explicit; illegal transitions throw.' },
    { name: 'AlertRule', fields: ['id: UUID', 'name: String', 'expression: RuleExpr', 'severity: Severity', 'sustainedForSeconds: Int', 'targets: Set<AlertTarget>'], note: 'Expression tree evaluated against a sliding window, not a single frame.' },
    { name: 'Alert', fields: ['id: UUID', 'ruleId', 'vehicleId', 'raisedAt: Instant', 'clearedAt: Instant?', 'acknowledgedBy: String?'], note: 'An alert is a state, not an event; re-firing updates rather than duplicating.' },
  ],
  rules: [
    { id: 'BR-01', text: 'A vehicle is OFFLINE when no frame has arrived for 10 minutes and the last known state was MOVING.' },
    { id: 'BR-02', text: 'A service is due when odometer since last service ≥ intervalKm OR months since last service ≥ intervalMonths, whichever comes first.' },
    { id: 'BR-03', text: 'Crossing 90% of a routine interval raises a work order in state RAISED; crossing 100% escalates its priority.' },
    { id: 'BR-04', text: 'A STATUTORY schedule breaching its due date takes the vehicle to status GROUNDED and blocks assignment.' },
    { id: 'BR-05', text: 'A rule with sustainedForSeconds fires only when the condition holds continuously for that window; a single frame never fires it.' },
    { id: 'BR-06', text: 'An alert already open for the same rule and vehicle updates lastSeenAt rather than raising a duplicate.' },
    { id: 'BR-07', text: 'A driver may read only the vehicle currently assigned to them; a depot manager only vehicles at their depot.' },
    { id: 'BR-08', text: 'Every read of historic position data writes an access-log row naming the subject, vehicle and range.' },
    { id: 'BR-09', text: 'Telemetry frames are idempotent on (vehicleId, at); a redelivered frame must not double-count odometer.' },
    { id: 'BR-10', text: 'Work order state transitions follow RAISED→SCHEDULED→IN_PROGRESS→CLOSED, with CANCELLED reachable from any state before CLOSED.' },
  ],
  nfrs: [
    { k: 'Ingest throughput', v: '30 msg/s sustained, 90 msg/s burst at shift change, zero loss' },
    { k: 'Live view freshness', v: '< 15 s from frame receipt to map update' },
    { k: 'Alert latency', v: '< 60 s from condition met to notification dispatched' },
    { k: 'Query latency', v: 'p95 < 500 ms for a 24h single-vehicle history' },
    { k: 'Retention', v: '90 days full resolution, 3 years at 5-minute aggregate' },
    { k: 'Availability', v: '99.9% for ingest, 99.5% for the query API' },
    { k: 'Durability', v: 'No frame loss on broker or consumer restart; at-least-once with idempotent writes' },
  ],
  risks: [
    { r: 'Ingest backpressure loses frames at shift change', i: 'Critical', mit: 'Kafka absorbs the burst; consumers scale on lag, not on rate. The MQTT bridge never writes to the database directly.' },
    { r: 'Duplicate frames double-count odometer', i: 'High', mit: 'Primary key (vehicle_id, at) with ON CONFLICT DO NOTHING; odometer deltas computed from stored rows, never accumulated in memory.' },
    { r: 'Alert storm on a fleet-wide condition', i: 'High', mit: 'Alerts are states keyed by rule+vehicle, plus a per-rule dispatch budget. A cold morning must not send 900 notifications.' },
    { r: 'TimescaleDB growth outpaces the plan', i: 'Medium', mit: 'Continuous aggregates and a compression policy from day one; capacity modelled at 900 vehicles × 2 frames/min × 90 days.' },
    { r: 'Position data misused', i: 'High', mit: 'Row-level authorisation by depot and assignment, plus a mandatory access log; the log is itself a compliance deliverable.' },
    { r: 'Clock skew on units puts frames in the future', i: 'Medium', mit: 'Reject frames more than 5 minutes ahead of server time; record skew as a unit health metric.' },
  ],
  unknowns: [
    'Does a GROUNDED vehicle need to notify a dispatch system we have not been told about?',
    'Who owns the alert rule catalogue — the workshop, or engineering?',
    'Is the 90-day full-resolution window a legal requirement or a cost choice?',
    'Should a driver see the fault description in plain language, or only "contact depot"?',
    'What is the authoritative source of the vehicle-to-driver assignment?',
    'Do statutory service dates come from our records or from an external register?',
  ],
  integrations: [
    'Telematics vendor MQTT broker — TLS, per-unit client certificates',
    'Corporate IdP (OIDC) — depot and role claims',
    'SMS/push gateway for driver and depot alerts',
    'Parts catalogue API — read-only, for work order part lines',
    'Finance system — monthly cost export',
  ],
  outOfScope: [
    'Route planning and optimisation', 'Fuel card reconciliation', 'Driver behaviour scoring',
    'Dashcam or video telematics', 'Customer-facing tracking', 'Automated parts ordering',
  ],
  stories: [
    { id: 'US-001', title: 'Ingest telemetry', as: 'the platform', want: 'to accept and persist every telemetry frame exactly once', so: 'nothing downstream is computed from missing or duplicated data', points: 8,
      ac: ['A valid frame is persisted and visible to queries within 15 s', 'A redelivered frame with the same (vehicleId, at) does not create a second row', 'A frame from an unknown vehicle is rejected and counted, not silently dropped'],
      edge: ['A burst of 90 msg/s is absorbed without loss', 'A frame timestamped 10 minutes in the future is rejected', 'A malformed payload is dead-lettered with the raw bytes retained'] },
    { id: 'US-002', title: 'Live depot map', as: 'a depot manager', want: 'to see my vehicles positioned and statused in near real time', so: 'I know what is happening right now', points: 8,
      ac: ['Map shows only vehicles at my depot', 'Status is derived: MOVING, IDLE, STOPPED or OFFLINE per BR-01', 'The view updates without a full reload as frames arrive'],
      edge: ['A vehicle that goes offline mid-session visibly changes state', 'A vehicle reassigned to another depot leaves my view'] },
    { id: 'US-003', title: 'Service due tracking', as: 'a workshop planner', want: 'work orders raised automatically as intervals approach', so: 'nothing is serviced late', points: 8,
      ac: ['Crossing 90% of a routine interval raises a RAISED work order once', 'Whichever of distance or time elapses first triggers', 'A statutory schedule past due grounds the vehicle'],
      edge: ['A vehicle serviced early resets progress correctly', 'An odometer rollback (unit replacement) does not raise a spurious order', 'Two thresholds crossed in one frame raise one order, not two'] },
    { id: 'US-004', title: 'Schedule a work order', as: 'a workshop planner', want: 'to book a work order into a depot bay', so: 'capacity is used and the vehicle is off the road once', points: 5,
      ac: ['Booking moves state RAISED → SCHEDULED with a bay and time', 'A bay cannot hold two overlapping work orders', 'Scheduling past the statutory due date is refused'],
      edge: ['Cancelling a scheduled order frees the bay', 'Rescheduling is atomic'] },
    { id: 'US-005', title: 'Sustained-condition alerting', as: 'a depot manager', want: 'an immediate alert when a genuine failure signature appears', so: 'we intervene before a roadside breakdown', points: 13,
      ac: ['A rule fires only when its condition holds for sustainedForSeconds continuously', 'A single spurious frame never fires an alert', 'An open alert for the same rule and vehicle updates rather than duplicating'],
      edge: ['A gap in frames during the window does not count as sustained', 'Clearing the condition closes the alert and notifies', 'A fleet-wide condition respects the per-rule dispatch budget'] },
    { id: 'US-006', title: 'Driver vehicle view', as: 'a driver', want: 'to see my own vehicle status and any instruction', so: 'I know if I should stop', points: 3,
      ac: ['I see exactly the vehicle assigned to me and no other', 'An active critical alert is shown with a plain-language instruction', 'No historic position data is exposed to me'],
      edge: ['An unassigned driver sees an empty state, not an error', 'Reassignment mid-shift changes the vehicle shown'] },
    { id: 'US-007', title: 'Reliability reporting', as: 'a fleet director', want: 'cost and reliability figures by depot, model and period', so: 'I can direct capital spend', points: 5,
      ac: ['Report gives breakdowns, work orders, mean distance between failures and cost per vehicle', 'Figures reconcile with the finance export', 'A range longer than 3 years is refused — data does not exist'],
      edge: ['A model with fewer than 5 vehicles is flagged as low-confidence', 'Vehicles sold mid-period are counted pro rata'] },
    { id: 'US-008', title: 'Position access audit', as: 'a compliance officer', want: 'every access to historic position data logged', so: 'we can answer a subject access request', points: 3,
      ac: ['Each historic position query writes subject, vehicle, range and timestamp', 'The log is append-only and queryable by vehicle or subject', 'Live status views are exempt and documented as such'],
      edge: ['A failed authorisation is logged as a denied attempt', 'Log write failure fails the request rather than serving data unlogged'] },
  ],
  endpoints: [
    { m: 'POST', p: '/ingest/v1/telemetry', d: 'Telemetry frame (MQTT bridge)', role: 'UNIT (mTLS)' },
    { m: 'GET', p: '/api/v1/vehicles', d: 'Vehicles visible to the caller', role: 'DEPOT_MANAGER, DIRECTOR' },
    { m: 'GET', p: '/api/v1/vehicles/{id}/live', d: 'Current status and position', role: 'DRIVER(own), DEPOT_MANAGER' },
    { m: 'GET', p: '/api/v1/vehicles/{id}/history', d: 'Telemetry history for a range (audited)', role: 'DEPOT_MANAGER' },
    { m: 'GET', p: '/api/v1/work-orders', d: 'Work orders with filters', role: 'PLANNER, DEPOT_MANAGER' },
    { m: 'POST', p: '/api/v1/work-orders/{id}/schedule', d: 'Book into a bay', role: 'PLANNER' },
    { m: 'POST', p: '/api/v1/work-orders/{id}/close', d: 'Close with parts and labour', role: 'PLANNER' },
    { m: 'GET', p: '/api/v1/alerts', d: 'Open alerts', role: 'DEPOT_MANAGER, PLANNER' },
    { m: 'POST', p: '/api/v1/alerts/{id}/ack', d: 'Acknowledge an alert', role: 'DEPOT_MANAGER' },
    { m: 'GET', p: '/api/v1/reports/reliability', d: 'Reliability and cost report', role: 'DIRECTOR' },
  ],
  vulns: [
    { cwe: 'CWE-639', owasp: 'A01:2021 Broken Access Control', sev: 'Critical', cvss: 8.6, title: 'Vehicle history readable across depots', where: 'VehicleController#history', fix: 'Authorisation checks authentication but not depot membership. Any authenticated user can read any vehicle\'s full movement history — this is personal data. Enforce depot scope in the repository query, not the controller.' },
    { cwe: 'CWE-306', owasp: 'A07:2021 Auth Failures', sev: 'Critical', cvss: 9.1, title: 'Ingest endpoint accepts unauthenticated frames', where: 'POST /ingest/v1/telemetry', fix: 'mTLS is configured on the broker but the HTTP bridge is open. Anyone who can reach it can forge odometer and fault data, triggering false groundings. Require the client certificate and pin the unit identity to the vehicle.' },
    { cwe: 'CWE-778', owasp: 'A09:2021 Logging Failures', sev: 'High', cvss: 7.1, title: 'Position access log is best-effort', where: 'AuditService#logAccess', fix: 'The write is in a try/catch that swallows failure, so data can be served with no audit trail — the exact opposite of the compliance requirement. Make it transactional with the read.' },
    { cwe: 'CWE-400', owasp: 'A04:2021 Insecure Design', sev: 'High', cvss: 7.5, title: 'Unbounded history range enables resource exhaustion', where: 'VehicleController#history', fix: 'A three-year range over a hypertable returns millions of rows. Cap the range at 31 days and require pagination.' },
    { cwe: 'CWE-1236', owasp: 'A03:2021 Injection', sev: 'Medium', cvss: 6.5, title: 'CSV export vulnerable to formula injection', where: 'ReportExporter#toCsv', fix: 'A registration or note beginning =, +, - or @ executes when the export is opened in Excel. Prefix such cells with a single quote.' },
    { cwe: 'CWE-330', owasp: 'A02:2021 Cryptographic Failures', sev: 'Medium', cvss: 5.9, title: 'Alert acknowledgement token uses Random', where: 'AlertService#issueAckToken', fix: 'java.util.Random is predictable; use SecureRandom. An attacker can acknowledge and hide a critical engine alert.' },
  ],
  findings: [
    { sev: 'High', kind: 'Cyclomatic complexity', where: 'RuleEvaluator#evaluate — complexity 31', what: 'A single method walks the expression tree, manages the sliding window, deduplicates alerts and dispatches notifications.', fix: 'Separate ExpressionEvaluator (pure), WindowState (stateful), and AlertDispatcher. The pure evaluator becomes unit-testable without a database.' },
    { sev: 'High', kind: 'Resource leak', where: 'TelemetryConsumer#poll', what: 'The Kafka consumer is not closed on shutdown; rebalances leave orphaned sessions and lag climbs after every deploy.', fix: 'Close in a @PreDestroy and register a shutdown hook.' },
    { sev: 'High', kind: 'Concurrency', where: 'WindowState — HashMap accessed from consumer threads', what: 'Unsynchronised HashMap under concurrent access; observed as alerts that never fire after a rebalance.', fix: 'Key the state by partition so one thread owns it, or use ConcurrentHashMap with atomic compute.' },
    { sev: 'Medium', kind: 'N+1 query', where: 'WorkOrderService#list', what: 'Vehicle and schedule fetched per work order; a 200-order page is 401 queries.', fix: 'Join fetch, or a projection DTO.' },
    { sev: 'Medium', kind: 'Duplication', where: 'Odometer delta computed in three services', what: 'Three implementations disagree on how to handle a unit replacement resetting the odometer.', fix: 'One OdometerLedger owning the rule, with the rollback case tested.' },
    { sev: 'Medium', kind: 'Missing null handling', where: 'ServiceScheduleEvaluator:64', what: 'intervalKm and intervalMonths are both nullable; the code assumes at least one is set but nothing enforces it.', fix: 'Validate on persistence that at least one is non-null, and model as a sealed type.' },
    { sev: 'Low', kind: 'Magic numbers', where: '10, 0.9, 300, 5 scattered across the evaluator', what: 'Offline threshold, warn ratio and skew tolerance are not named.', fix: 'A FleetRules configuration bean.' },
  ],
  hardProblem: {
    title: 'A condition that must hold continuously, on an at-least-once stream',
    body: 'The valuable alerts are sustained ones — coolant over threshold for five minutes, not one hot frame. That needs state across frames. But the stream is at-least-once, frames arrive out of order, consumers rebalance mid-window, and a naive in-memory timer either loses the window on rebalance or fires twice after a redelivery.',
    solution: 'Make the window derivable from stored data rather than held in memory. Each frame writes idempotently on (vehicle_id, at); the evaluator then asks a windowed query whether the condition held across every frame in the interval, with a minimum frame count so a gap cannot masquerade as sustained. Alert identity is (rule_id, vehicle_id) with an open/closed state, so a redelivery updates rather than duplicates, and a rebalance replays into the same answer. The evaluation becomes a pure function of persisted state — which also makes it testable by inserting frames and asserting.',
  },
  metrics: [
    { k: 'Vehicles', v: '900' }, { k: 'Depots', v: '14' },
    { k: 'Frames / second', v: '30 (90 burst)' }, { k: 'Breakdowns last year', v: '260' },
    { k: 'Cost per breakdown', v: '£2,400' }, { k: 'Full-resolution retention', v: '90 days' },
  ],
};

/* ------------------------------------------------------------------ 04 */
const billing: Brief = {
  id: 'billing',
  title: 'Multi-Tenant Usage Billing & Invoicing',
  short: 'Usage Billing',
  domain: 'B2B SaaS finance',
  stack: 'TypeScript, NestJS, PostgreSQL, Stripe',
  stackList: ['TypeScript 5.3', 'NestJS 10', 'PostgreSQL 15', 'Stripe API', 'BullMQ', 'Prisma'],
  summary: 'Metered billing for 1,200 tenants. Every invoice must reconcile to the cent.',
  requirement: `We sell a developer platform to 1,200 business customers and we bill for usage. Our current billing is a monthly spreadsheet exercise that takes two people four days and still produces disputes. We need to replace it.

Pricing. Every customer is on a plan. A plan has a monthly platform fee and a set of metered dimensions — API calls, compute-seconds, and storage gigabyte-months. Each dimension is billed in tiers, for example the first million API calls included, the next nine million at £0.40 per thousand, everything above at £0.25 per thousand. Tiers are graduated, not volume — you pay each tier's rate for the units that fall in that tier. Some customers have negotiated overrides on specific dimensions, and some have a contractual discount percentage applied to the whole invoice.

Metering. Usage events arrive from the platform continuously, tagged with tenant, dimension and quantity. Volume is roughly 40 million events a month. Events can arrive late — up to 48 hours — and occasionally duplicate. Billing must be exact: two runs over the same period must produce byte-identical invoices.

Invoicing. On the first of each month we close the previous period, calculate every invoice, and produce a PDF and a JSON breakdown showing how each line was derived. Finance reviews a draft, may apply a manual credit with a reason, then approves. Approved invoices are pushed to Stripe for collection. A failed payment retries on a schedule and then escalates.

Credits and adjustments. Finance can issue a credit note against an approved invoice. Credits never mutate the original invoice; they are separate documents that net against the balance.

Currency. Customers are billed in GBP, USD or EUR depending on contract. Rates are fixed per contract, not spot — we do not do FX conversion at invoice time, each plan has prices per currency.

Who uses it: finance analysts (review, credit, approve), finance managers (approve above a threshold, close a period), customer success (read-only view of a customer's invoices and usage), and the platform itself (emits usage events).

Non-functional. Month-end close for 1,200 customers must complete within one hour. Calculation must be deterministic and reproducible — given the same events, the same invoice, forever. Rounding is half-up to the minor unit at the line level, never at the tier level. Every figure on an invoice must be traceable to the events that produced it. Financial records are retained for 7 years and are immutable once approved.

Out of scope: tax calculation (we use an external provider and will integrate later), dunning email content, revenue recognition, multi-entity consolidation, and self-serve plan changes.`,
  actors: [
    { name: 'Finance analyst', can: 'Review draft invoices, drill into line derivation, apply credits with a reason, submit for approval.' },
    { name: 'Finance manager', can: 'Everything an analyst can, plus approve invoices above the threshold and close an accounting period.' },
    { name: 'Customer success', can: 'Read-only access to a customer\'s invoices, usage and credit history. No mutation.' },
    { name: 'Platform', can: 'Emits usage events. Authenticated by service credential; cannot read invoices.' },
    { name: 'Stripe', can: 'Receives approved invoices for collection; posts payment webhooks back.' },
  ],
  entities: [
    { name: 'Tenant', fields: ['id: UUID', 'name: string', 'planId: UUID', 'currency: Currency', 'discountPct: Decimal', 'billingAnchor: number'], note: 'Currency is fixed per contract; never converted at invoice time.' },
    { name: 'Plan', fields: ['id: UUID', 'name: string', 'platformFee: Money', 'dimensions: PlanDimension[]', 'version: number'], note: 'Immutable once used by an invoice; changes create a new version.' },
    { name: 'PlanDimension', fields: ['dimension: API_CALLS|COMPUTE_SECONDS|STORAGE_GB_MONTHS', 'tiers: Tier[]', 'unit: string'], note: 'Tiers are graduated: each tier\'s rate applies to units falling within it.' },
    { name: 'UsageEvent', fields: ['id: string (idempotency key)', 'tenantId', 'dimension', 'quantity: Decimal', 'occurredAt: Instant', 'receivedAt: Instant'], note: 'Unique on id. occurredAt decides the period, receivedAt allows late-arrival analysis.' },
    { name: 'Invoice', fields: ['id: UUID', 'tenantId', 'periodStart/End', 'state: DRAFT|PENDING_APPROVAL|APPROVED|SENT|PAID|FAILED', 'lines: InvoiceLine[]', 'subtotal/discount/total: Money', 'issuedAt: Instant?'], note: 'Immutable from APPROVED onward; corrections are credit notes.' },
    { name: 'InvoiceLine', fields: ['dimension', 'tierBreakdown: TierLine[]', 'quantity: Decimal', 'amount: Money', 'derivation: JsonB'], note: 'derivation holds the exact arithmetic so any figure can be explained.' },
    { name: 'CreditNote', fields: ['id: UUID', 'invoiceId', 'amount: Money', 'reason: string', 'issuedBy: string', 'issuedAt: Instant'], note: 'Never mutates the invoice; nets against the balance.' },
  ],
  rules: [
    { id: 'BR-01', text: 'Usage events are unique on their idempotency key; a redelivered event is ignored, never added.' },
    { id: 'BR-02', text: 'An event belongs to the period containing its occurredAt, regardless of when it was received.' },
    { id: 'BR-03', text: 'Tiers are graduated: each tier\'s rate applies only to the quantity falling inside that tier.' },
    { id: 'BR-04', text: 'Rounding is half-up to the currency minor unit, applied once at the line level and never at tier level.' },
    { id: 'BR-05', text: 'A tenant override on a dimension replaces the plan tiers for that dimension only.' },
    { id: 'BR-06', text: 'The contractual discount applies to the subtotal after all lines, before tax.' },
    { id: 'BR-07', text: 'Recalculating a period from the same events must produce a byte-identical invoice.' },
    { id: 'BR-08', text: 'An invoice in APPROVED or later is immutable; corrections are issued as credit notes.' },
    { id: 'BR-09', text: 'Approval above the configured threshold requires the FINANCE_MANAGER role.' },
    { id: 'BR-10', text: 'Every invoice line stores the derivation used to compute it, sufficient to reproduce the figure without re-running the engine.' },
  ],
  nfrs: [
    { k: 'Month-end close', v: '1,200 invoices calculated and drafted within 60 minutes' },
    { k: 'Determinism', v: 'Identical inputs produce byte-identical output indefinitely' },
    { k: 'Ingest', v: '40M events/month, ~15/s average, 200/s burst' },
    { k: 'Late arrival', v: 'Events up to 48h late are attributed to the correct period' },
    { k: 'Precision', v: 'Decimal arithmetic throughout; floating point is prohibited in money paths' },
    { k: 'Retention', v: 'Financial records immutable and retained 7 years' },
    { k: 'Auditability', v: 'Every figure traceable to source events through the stored derivation' },
  ],
  risks: [
    { r: 'Floating-point arithmetic in money calculations', i: 'Critical', mit: 'Decimal type end to end, enforced by a lint rule banning number arithmetic in the pricing module and by property tests over tier boundaries.' },
    { r: 'Late events change an already-approved invoice', i: 'High', mit: 'Period close draws a line: events arriving after close for a closed period land in a spillover report and are credited or billed next period, never mutating an approved invoice.' },
    { r: 'Duplicate events inflate a bill', i: 'High', mit: 'Idempotency key is the primary key; ingest is INSERT ... ON CONFLICT DO NOTHING.' },
    { r: 'Non-deterministic ordering changes rounding', i: 'High', mit: 'Aggregation is order-independent by construction (sum then tier), and tier boundaries are covered by property-based tests.' },
    { r: 'Stripe push partially completes at month end', i: 'Medium', mit: 'Push is an outbox with idempotency keys per invoice; a retry cannot double-charge.' },
    { r: 'Plan edited mid-period changes historic bills', i: 'Medium', mit: 'Plans are versioned and an invoice pins the version it used.' },
  ],
  unknowns: [
    'When a tenant changes plan mid-period, is the platform fee prorated by day, or charged in full on the anchor?',
    'Does a credit note against a paid invoice trigger a refund, or only reduce the next balance?',
    'What is the approval threshold, and is it per currency?',
    'How are events attributed for a tenant that changes currency mid-contract?',
    'Should storage GB-months be measured by peak, average or end-of-period sample?',
    'Who may issue a credit note above the approval threshold?',
  ],
  integrations: [
    'Stripe — invoice creation and payment webhooks, idempotency keys per invoice',
    'Corporate SSO (OIDC) — finance roles from group claims',
    'Object storage — invoice PDF archive with 7-year lifecycle policy',
    'Tax provider (future) — the seam exists, no adapter in v1',
    'Data warehouse — nightly invoice and usage extract',
  ],
  outOfScope: [
    'Tax calculation', 'Dunning email content and cadence', 'Revenue recognition',
    'Multi-entity consolidation', 'Self-serve plan changes', 'FX conversion at invoice time',
  ],
  stories: [
    { id: 'US-001', title: 'Ingest usage events idempotently', as: 'the platform', want: 'usage events recorded exactly once', so: 'bills are never inflated by redelivery', points: 5,
      ac: ['An event with a new idempotency key is stored', 'An event with a seen key is ignored and counted as a duplicate', 'Ingest sustains 200 events/s without loss'],
      edge: ['An event arriving 47h late is attributed to its occurredAt period', 'An event for an unknown tenant is dead-lettered, not dropped', 'A negative quantity is rejected'] },
    { id: 'US-002', title: 'Graduated tier calculation', as: 'the billing engine', want: 'to price a quantity across graduated tiers exactly', so: 'the invoice is arithmetically correct', points: 8,
      ac: ['Each tier\'s rate applies only to units within that tier', 'Rounding is half-up at line level only', 'A quantity landing exactly on a tier boundary is priced in the lower tier'],
      edge: ['Zero usage produces a zero line, not a missing line', 'Usage below the included allowance produces a zero-amount line showing the allowance', 'A single event larger than the whole top tier prices correctly'] },
    { id: 'US-003', title: 'Tenant overrides and discounts', as: 'a finance analyst', want: 'negotiated rates and discounts applied correctly', so: 'contracts are honoured', points: 5,
      ac: ['A dimension override replaces plan tiers for that dimension only', 'The contract discount applies to the subtotal after all lines', 'Override and discount both appear in the derivation'],
      edge: ['A 100% discount produces a zero invoice that still lists lines', 'An override with fewer tiers than the plan is applied as written'] },
    { id: 'US-004', title: 'Month-end close', as: 'a finance manager', want: 'to close a period and generate all draft invoices', so: 'billing happens on schedule', points: 13,
      ac: ['Close produces a draft invoice for every active tenant within 60 minutes', 'Closing an already-closed period is refused', 'Events arriving after close are reported as spillover, not applied'],
      edge: ['A tenant with zero usage still gets an invoice for the platform fee', 'A tenant that left mid-period is billed pro rata to their end date', 'A crash mid-close resumes without duplicating invoices'] },
    { id: 'US-005', title: 'Review and approve', as: 'a finance analyst', want: 'to review a draft and submit it for approval', so: 'errors are caught before the customer sees them', points: 5,
      ac: ['Every line can be drilled into to show its derivation', 'Submitting moves DRAFT → PENDING_APPROVAL', 'Approval above the threshold requires FINANCE_MANAGER'],
      edge: ['An approved invoice cannot be edited', 'Two analysts approving concurrently — one wins, the other gets a conflict'] },
    { id: 'US-006', title: 'Issue a credit note', as: 'a finance analyst', want: 'to credit an approved invoice with a reason', so: 'disputes are resolved without falsifying records', points: 5,
      ac: ['A credit note is a separate immutable document referencing the invoice', 'The original invoice is unchanged', 'The credit nets against the customer balance'],
      edge: ['A credit larger than the invoice is refused', 'A credit against an unpaid invoice reduces the amount collected'] },
    { id: 'US-007', title: 'Push to Stripe and handle payment', as: 'the system', want: 'approved invoices collected reliably', so: 'cash arrives without manual work', points: 8,
      ac: ['Each approved invoice is pushed once, with an idempotency key', 'A payment webhook moves the invoice to PAID', 'A failure moves it to FAILED and schedules a retry'],
      edge: ['A duplicate webhook does not double-apply', 'A push retried after a timeout does not create a second Stripe invoice'] },
    { id: 'US-008', title: 'Reproduce a historic invoice', as: 'an auditor', want: 'to recompute a past invoice from stored events', so: 'I can verify the figures years later', points: 5,
      ac: ['Recomputation of a closed period reproduces the invoice byte-identically', 'The pinned plan version is used, not the current one', 'Any divergence is reported as a reconciliation failure'],
      edge: ['A period whose events were archived recomputes from the archive', 'A recomputation never mutates the stored invoice'] },
  ],
  endpoints: [
    { m: 'POST', p: '/api/v1/usage', d: 'Ingest usage events (batch)', role: 'PLATFORM' },
    { m: 'POST', p: '/api/v1/periods/{period}/close', d: 'Close a period and draft invoices', role: 'FINANCE_MANAGER' },
    { m: 'GET', p: '/api/v1/invoices', d: 'List invoices with filters', role: 'ANALYST, MANAGER, CS' },
    { m: 'GET', p: '/api/v1/invoices/{id}/derivation', d: 'Full line-by-line derivation', role: 'ANALYST, MANAGER' },
    { m: 'POST', p: '/api/v1/invoices/{id}/submit', d: 'Submit for approval', role: 'ANALYST' },
    { m: 'POST', p: '/api/v1/invoices/{id}/approve', d: 'Approve an invoice', role: 'MANAGER' },
    { m: 'POST', p: '/api/v1/invoices/{id}/credit-notes', d: 'Issue a credit note', role: 'ANALYST, MANAGER' },
    { m: 'POST', p: '/webhooks/stripe', d: 'Payment status callbacks', role: 'STRIPE (signature)' },
  ],
  vulns: [
    { cwe: 'CWE-345', owasp: 'A08:2021 Data Integrity Failures', sev: 'Critical', cvss: 9.1, title: 'Stripe webhook signature not verified', where: 'WebhookController#stripe', fix: 'The handler parses the body and marks invoices PAID without calling stripe.webhooks.constructEvent. Anyone who finds the URL can mark every invoice paid. Verify the signature against the endpoint secret and reject on failure.' },
    { cwe: 'CWE-639', owasp: 'A01:2021 Broken Access Control', sev: 'Critical', cvss: 8.6, title: 'Cross-tenant invoice access', where: 'InvoiceController#findOne', fix: 'The query filters by invoice id only. A customer-success user for tenant A can read tenant B\'s invoices, including negotiated rates. Scope every query by the caller\'s tenant, in the repository layer.' },
    { cwe: 'CWE-285', owasp: 'A01:2021 Broken Access Control', sev: 'High', cvss: 8.2, title: 'Approval threshold enforced only in the UI', where: 'InvoiceService#approve', fix: 'The threshold check lives in the front end. An analyst can approve any amount via the API. Enforce server-side against the verified role.' },
    { cwe: 'CWE-682', owasp: 'A04:2021 Insecure Design', sev: 'High', cvss: 7.5, title: 'Floating-point arithmetic in the discount path', where: 'PricingEngine#applyDiscount', fix: 'subtotal * (1 - pct/100) in JS number arithmetic. Produces off-by-a-penny invoices that finance then disputes. Use Decimal throughout and ban number arithmetic in this module by lint rule.' },
    { cwe: 'CWE-1236', owasp: 'A03:2021 Injection', sev: 'Medium', cvss: 6.5, title: 'CSV export formula injection', where: 'InvoiceExporter#toCsv', fix: 'Tenant names are attacker-controlled and written unescaped; a name starting with = executes in Excel on a finance workstation. Prefix with a quote and quote all fields.' },
    { cwe: 'CWE-532', owasp: 'A09:2021 Logging Failures', sev: 'Medium', cvss: 5.3, title: 'Full invoice payload logged at INFO', where: 'BillingRunService#run', fix: 'Negotiated rates and totals for every tenant land in logs with a shorter retention policy and broader access than the database. Log identifiers only.' },
  ],
  findings: [
    { sev: 'High', kind: 'Correctness risk', where: 'PricingEngine — number arithmetic in 7 places', what: 'Money handled as IEEE-754 doubles. Tier boundaries at 1,000,000 units already reproduce off-by-one-penny errors.', fix: 'Decimal end to end; add a property test asserting sum(tier amounts) === line amount across random quantities.' },
    { sev: 'High', kind: 'Cyclomatic complexity', where: 'BillingRunService#run — complexity 27', what: 'Period validation, tenant iteration, pricing, discounting, persistence and Stripe push in one method with nested try/catch.', fix: 'Split into PeriodCloser, InvoiceCalculator (pure) and InvoicePublisher. The calculator being pure is what makes BR-07 testable.' },
    { sev: 'High', kind: 'Missing idempotency', where: 'BillingRunService — resume after crash', what: 'A crash mid-run re-drafts invoices already created, producing duplicates for the same tenant and period.', fix: 'Unique constraint on (tenant_id, period_start) and ON CONFLICT DO NOTHING; the run becomes resumable.' },
    { sev: 'Medium', kind: 'N+1 query', where: 'InvoiceService#list', what: 'Lines and credit notes fetched per invoice; a 100-invoice page is 201 queries.', fix: 'Prisma include, or a single projection query.' },
    { sev: 'Medium', kind: 'Duplication', where: 'Tier maths in PricingEngine and in the PDF renderer', what: 'The PDF recomputes tier breakdowns rather than reading the stored derivation, and rounds differently.', fix: 'The PDF must render the stored derivation. Recomputation anywhere but the engine is a defect.' },
    { sev: 'Medium', kind: 'Unbounded query', where: 'UsageRepository#forPeriod', what: 'Loads every event for a tenant-period into memory; a large tenant is 400k rows.', fix: 'Aggregate in SQL — the engine needs sums per dimension, not the events.' },
    { sev: 'Low', kind: 'Magic numbers', where: 'Rounding mode, threshold and retry counts inline', what: 'Financial constants are not centralised or documented.', fix: 'A BillingConfig module with each constant named and commented against its rule ID.' },
  ],
  hardProblem: {
    title: 'Two runs over the same period must produce byte-identical invoices',
    body: 'Determinism is not automatic. Events arrive out of order and late; aggregation over a set whose iteration order varies can change where rounding falls; a plan edited mid-month would silently reprice history; and floating-point addition is not associative, so even summing the same numbers in a different order can differ in the last penny.',
    solution: 'Four decisions together. Aggregate before pricing, so the engine sees one total per dimension and ordering cannot matter. Use Decimal with an explicit rounding mode applied once, at line level. Pin the plan version onto the invoice so history reprices against what was contractually in force. And treat period close as a boundary: events arriving afterwards go to a spillover report rather than mutating a closed period. The calculator then becomes a pure function of (aggregated usage, pinned plan, tenant terms) — which is exactly what makes it testable and what lets an auditor reproduce a figure seven years later.',
  },
  metrics: [
    { k: 'Tenants', v: '1,200' }, { k: 'Events / month', v: '40M' },
    { k: 'Close window', v: '60 min' }, { k: 'Current close effort', v: '2 people × 4 days' },
    { k: 'Currencies', v: 'GBP / USD / EUR' }, { k: 'Retention', v: '7 years' },
  ],
};

/* ------------------------------------------------------------------ 05 */
const warehouse: Brief = {
  id: 'warehouse',
  title: 'Warehouse Inventory & Replenishment',
  short: 'Inventory & Replenishment',
  domain: 'Retail supply chain',
  stack: 'Java, Spring Boot, PostgreSQL, RabbitMQ',
  stackList: ['Java 17', 'Spring Boot 3.2', 'PostgreSQL 15', 'RabbitMQ', 'Liquibase'],
  summary: 'Three DCs, 45k SKUs. Stop overselling stock that has already been picked.',
  requirement: `We run three distribution centres serving 180 retail stores and a growing online channel. We are oversellings stock and it is costing us: an order is accepted, then picking finds the shelf empty, and we cancel on the customer. Last quarter that was 3,100 cancellations.

The core problem is that "stock on hand" and "stock available to promise" are not the same number, and our current system only tracks the first.

What we need
- Accurate inventory per SKU per location, distinguishing on-hand, allocated (promised to an order but not yet picked), and available.
- Allocation when an order is accepted, so the stock is reserved before we promise it.
- Release when an order is cancelled or expires unpicked.
- Replenishment: when available stock for a SKU at a DC falls below its reorder point, raise a purchase suggestion sized to the reorder quantity, taking into account stock already on order.
- Stock movements: receipts from suppliers, transfers between DCs, picks, returns and adjustments after a stock count. Every movement must be a ledger entry — we need to explain any number at any past date.
- Cycle counting: the warehouse counts a subset of locations daily. A count that disagrees with the system creates an adjustment and, above a variance threshold, requires a supervisor to approve it.

Who uses it: warehouse operatives (record receipts, picks, counts), inventory controllers (investigate variances, approve adjustments, tune reorder points), buyers (see and act on purchase suggestions), and store/online order systems (call us to allocate and release).

Non-functional. 45,000 SKUs across 3 DCs. Peak allocation traffic is 60 requests per second during a promotion. An allocation must never oversell, even under concurrent requests for the last unit. Availability must be 99.9% — if we cannot allocate, the shop stops selling. Ledger history is retained for 7 years for audit. The available figure must be correct, not eventually correct.

Out of scope: warehouse robotics integration, carrier and shipping label generation, demand forecasting (we will feed reorder points from a separate system later), store-level inventory, and returns grading.`,
  actors: [
    { name: 'Warehouse operative', can: 'Record receipts, picks, transfers and cycle counts on a handheld. Cannot approve adjustments or change reorder points.' },
    { name: 'Inventory controller', can: 'Investigate variances, approve adjustments above threshold, tune reorder points and safety stock.' },
    { name: 'Buyer', can: 'View purchase suggestions, convert to purchase orders, record expected delivery dates.' },
    { name: 'Order system', can: 'Calls allocate and release. Service credential; cannot read ledger history or approve anything.' },
    { name: 'Supervisor', can: 'Approves adjustments above the variance threshold. A second pair of eyes, deliberately not the counter.' },
  ],
  entities: [
    { name: 'Sku', fields: ['id: UUID', 'code: String', 'description: String', 'unitOfMeasure: Uom', 'active: boolean'], note: 'Code is the business key used on handhelds and purchase orders.' },
    { name: 'StockPosition', fields: ['skuId', 'locationId', 'onHand: int', 'allocated: int', 'available: int (derived)', 'version: long'], note: 'available = onHand - allocated, derived never stored, so it cannot drift.' },
    { name: 'LedgerEntry', fields: ['id: UUID', 'skuId', 'locationId', 'kind: RECEIPT|PICK|TRANSFER_IN|TRANSFER_OUT|RETURN|ADJUSTMENT', 'qty: int (signed)', 'reference: String', 'at: Instant', 'by: ActorRef'], note: 'Append-only. Every position is reconstructible by replaying entries.' },
    { name: 'Allocation', fields: ['id: UUID', 'orderRef: String', 'skuId', 'locationId', 'qty: int', 'state: HELD|PICKED|RELEASED|EXPIRED', 'expiresAt: Instant'], note: 'Holds expire so an abandoned basket cannot strand stock forever.' },
    { name: 'ReplenishmentRule', fields: ['skuId', 'locationId', 'reorderPoint: int', 'reorderQty: int', 'safetyStock: int', 'leadTimeDays: int'], note: 'Tuned by controllers; a forecasting system will feed these later.' },
    { name: 'PurchaseSuggestion', fields: ['id: UUID', 'skuId', 'locationId', 'suggestedQty: int', 'raisedAt: Instant', 'state: OPEN|ORDERED|DISMISSED', 'onOrderAtRaise: int'], note: 'Records what was already on order so a suggestion can be explained later.' },
    { name: 'CycleCount', fields: ['id: UUID', 'locationId', 'skuId', 'countedQty: int', 'systemQty: int', 'variance: int', 'state: PENDING|APPROVED|REJECTED', 'countedBy/approvedBy'], note: 'Above the variance threshold, approvedBy must differ from countedBy.' },
  ],
  rules: [
    { id: 'BR-01', text: 'available = onHand − allocated, computed from the ledger and open allocations. It is never stored as an independent column.' },
    { id: 'BR-02', text: 'An allocation succeeds only if available ≥ requested at the moment of the write; overselling is impossible even under concurrency.' },
    { id: 'BR-03', text: 'An allocation not picked before expiresAt moves to EXPIRED and its quantity returns to available.' },
    { id: 'BR-04', text: 'A pick converts HELD to PICKED and writes a negative ledger entry; on-hand and allocated both fall.' },
    { id: 'BR-05', text: 'Every change to stock writes exactly one append-only ledger entry; positions are derived, never edited directly.' },
    { id: 'BR-06', text: 'A purchase suggestion is raised when available + onOrder < reorderPoint, sized to reorderQty, and only if no OPEN suggestion exists for that SKU and location.' },
    { id: 'BR-07', text: 'A cycle count variance above the threshold requires approval by a different user than the counter.' },
    { id: 'BR-08', text: 'An approved count writes an ADJUSTMENT ledger entry equal to the variance, with the count as its reference.' },
    { id: 'BR-09', text: 'A transfer is two entries — TRANSFER_OUT at source and TRANSFER_IN at destination — committed together or not at all.' },
    { id: 'BR-10', text: 'Ledger entries are immutable. A mistake is corrected by a compensating entry, never by an update or delete.' },
  ],
  nfrs: [
    { k: 'Allocation throughput', v: '60 req/s peak during promotions' },
    { k: 'Allocation latency', v: 'p95 < 150 ms — it sits in the order path' },
    { k: 'Correctness', v: 'Zero oversell. Strong consistency on available, not eventual.' },
    { k: 'Availability', v: '99.9% — an allocation outage stops selling' },
    { k: 'Scale', v: '45,000 SKUs × 3 DCs = 135,000 positions; ~400k ledger entries/day' },
    { k: 'Retention', v: 'Ledger retained 7 years, queryable at any historic date' },
    { k: 'Recovery', v: 'Positions fully reconstructible by replaying the ledger' },
  ],
  risks: [
    { r: 'Overselling the last unit under concurrency', i: 'Critical — the reason for the project', mit: 'Conditional UPDATE with the availability predicate in the WHERE clause; zero rows updated means insufficient stock. Atomic, no read-then-write window, no application lock.' },
    { r: 'Ledger and position drift apart', i: 'High', mit: 'Position is derived from the ledger, plus a nightly reconciliation job that recomputes from scratch and alerts on any difference.' },
    { r: 'Expired allocations strand stock', i: 'High', mit: 'A sweeper expires holds past expiresAt; the expiry is also evaluated lazily on read so a stalled sweeper cannot hide stock.' },
    { r: 'Duplicate suggestions spam buyers', i: 'Medium', mit: 'Partial unique index on (sku, location) WHERE state = OPEN.' },
    { r: 'Handheld retries create duplicate movements', i: 'High', mit: 'Every movement carries a client-supplied idempotency key, unique in the ledger.' },
    { r: 'Cycle count approved by the counter', i: 'Medium', mit: 'Enforced in the domain: approvedBy must differ from countedBy above the threshold, tested explicitly.' },
  ],
  unknowns: [
    'How long should an allocation hold before expiring — is it the same for store and online orders?',
    'What is the variance threshold, and is it absolute units or a percentage of on-hand?',
    'Should a transfer in flight count as on-order for replenishment at the destination?',
    'Who owns reorder points until the forecasting system arrives?',
    'Are partial picks allowed against a single allocation, or is it all-or-nothing?',
    'Does a return go back to available immediately, or into a quarantine location first?',
  ],
  integrations: [
    'Store and online order systems — allocate/release over REST, service credentials',
    'Supplier EDI — inbound advance shipping notices',
    'Handheld terminals — REST over the warehouse WLAN, offline queue with idempotency keys',
    'Finance — nightly stock valuation extract',
    'Future forecasting system — will write reorder points; the seam exists in v1',
  ],
  outOfScope: [
    'Warehouse robotics and conveyor integration', 'Carrier selection and shipping labels',
    'Demand forecasting', 'Store-level inventory', 'Returns grading and refurbishment', 'Supplier payment',
  ],
  stories: [
    { id: 'US-001', title: 'Allocate stock to an order', as: 'the order system', want: 'to reserve stock when an order is accepted', so: 'we never promise what we do not have', points: 8,
      ac: ['Allocation succeeds when available ≥ requested and creates a HELD allocation', 'Allocation fails with 409 INSUFFICIENT_STOCK when available < requested, changing nothing', 'Concurrent requests for the last unit — exactly one succeeds'],
      edge: ['Requesting zero or negative quantity is rejected', 'Allocating an inactive SKU is rejected', 'A retried request with the same idempotency key returns the original allocation'] },
    { id: 'US-002', title: 'Release and expiry', as: 'the order system', want: 'stock returned when an order is cancelled or abandoned', so: 'stock is not stranded', points: 5,
      ac: ['Releasing a HELD allocation returns quantity to available immediately', 'An allocation past expiresAt is treated as expired even if the sweeper has not run', 'Releasing an already-released allocation is idempotent'],
      edge: ['Releasing a PICKED allocation is refused — that is a return, not a release', 'The sweeper expiring thousands of holds does not block allocation'] },
    { id: 'US-003', title: 'Record a receipt', as: 'a warehouse operative', want: 'to book supplier stock into a location', so: 'it becomes available to sell', points: 3,
      ac: ['A receipt writes a positive ledger entry and raises on-hand and available', 'A receipt references the purchase order and advance shipping notice', 'A duplicate scan with the same idempotency key books once'],
      edge: ['Receiving more than ordered is allowed but flagged for the controller', 'Receiving against a closed purchase order is refused'] },
    { id: 'US-004', title: 'Pick against an allocation', as: 'a warehouse operative', want: 'to confirm a pick', so: 'the ledger reflects what left the building', points: 5,
      ac: ['A pick moves the allocation HELD → PICKED and writes a negative ledger entry', 'On-hand and allocated both fall; available is unchanged', 'Picking more than allocated is refused'],
      edge: ['A partial pick is refused in v1 and returns a clear code', 'Picking an expired allocation is refused with a re-allocate instruction'] },
    { id: 'US-005', title: 'Replenishment suggestions', as: 'a buyer', want: 'suggestions when stock falls below the reorder point', so: 'I order before we run out', points: 5,
      ac: ['A suggestion is raised when available + onOrder < reorderPoint', 'Only one OPEN suggestion exists per SKU and location', 'The suggestion records what was on order when it was raised'],
      edge: ['Stock recovering above the reorder point does not auto-dismiss an open suggestion', 'A SKU with no rule raises nothing rather than erroring'] },
    { id: 'US-006', title: 'Cycle count and approval', as: 'an inventory controller', want: 'counts that disagree to be investigated and approved', so: 'adjustments are deliberate', points: 8,
      ac: ['A count matching the system closes with no ledger entry', 'A variance within threshold auto-approves and writes an ADJUSTMENT', 'A variance above threshold requires approval by a different user'],
      edge: ['The counter attempting to approve their own count is refused', 'A rejected count writes no adjustment and is retained for audit'] },
    { id: 'US-007', title: 'Transfer between DCs', as: 'an inventory controller', want: 'to move stock between distribution centres', so: 'stock sits where demand is', points: 5,
      ac: ['A transfer writes TRANSFER_OUT and TRANSFER_IN atomically', 'Source availability is checked before the move', 'In-flight transfers are visible at both ends'],
      edge: ['A transfer failing at the destination rolls back the source', 'A transfer to the same location is refused'] },
    { id: 'US-008', title: 'Historic position query', as: 'an auditor', want: 'the stock position for any SKU at any past date', so: 'I can reconcile to the accounts', points: 5,
      ac: ['A position at a past instant is reconstructed by replaying the ledger', 'The figure reconciles with the finance extract for that date', 'A query over a SKU with no movements returns zero, not an error'],
      edge: ['A date before the SKU existed returns zero', 'Reconstruction over 7 years of entries completes within the query timeout'] },
  ],
  endpoints: [
    { m: 'POST', p: '/api/v1/allocations', d: 'Allocate stock for an order', role: 'ORDER_SYSTEM' },
    { m: 'DELETE', p: '/api/v1/allocations/{id}', d: 'Release an allocation', role: 'ORDER_SYSTEM' },
    { m: 'POST', p: '/api/v1/allocations/{id}/pick', d: 'Confirm a pick', role: 'OPERATIVE' },
    { m: 'POST', p: '/api/v1/movements/receipt', d: 'Book a supplier receipt', role: 'OPERATIVE' },
    { m: 'POST', p: '/api/v1/movements/transfer', d: 'Transfer between locations', role: 'CONTROLLER' },
    { m: 'GET', p: '/api/v1/stock/{sku}', d: 'Current position across locations', role: 'ALL AUTHENTICATED' },
    { m: 'GET', p: '/api/v1/stock/{sku}/at', d: 'Historic position at an instant', role: 'CONTROLLER, AUDITOR' },
    { m: 'POST', p: '/api/v1/counts', d: 'Submit a cycle count', role: 'OPERATIVE' },
    { m: 'POST', p: '/api/v1/counts/{id}/approve', d: 'Approve a variance', role: 'SUPERVISOR' },
    { m: 'GET', p: '/api/v1/suggestions', d: 'Open purchase suggestions', role: 'BUYER' },
  ],
  vulns: [
    { cwe: 'CWE-362', owasp: 'A04:2021 Insecure Design', sev: 'Critical', cvss: 8.2, title: 'Read-then-write allocation permits overselling', where: 'AllocationService#allocate', fix: 'The service SELECTs availability then INSERTs, with a race window between. Two requests for the last unit both succeed — the exact defect the project exists to fix. Replace with a conditional UPDATE whose WHERE clause carries the availability predicate, and treat zero updated rows as insufficient stock.' },
    { cwe: 'CWE-863', owasp: 'A01:2021 Broken Access Control', sev: 'High', cvss: 7.7, title: 'Count approval does not enforce segregation of duties', where: 'CycleCountService#approve', fix: 'BR-07 requires approvedBy ≠ countedBy, but the check is absent. An operative can conceal shrinkage by counting and approving their own variance. Enforce in the domain and test it.' },
    { cwe: 'CWE-285', owasp: 'A01:2021 Broken Access Control', sev: 'High', cvss: 7.1, title: 'Adjustment endpoint open to any authenticated user', where: 'MovementController#adjust', fix: 'No role check. Any handheld credential can write an arbitrary ADJUSTMENT and make stock appear or disappear. Restrict to CONTROLLER and require an approved count reference.' },
    { cwe: 'CWE-89', owasp: 'A03:2021 Injection', sev: 'High', cvss: 7.5, title: 'SKU search concatenates user input into SQL', where: 'SkuRepository#search', fix: 'The LIKE pattern is built by string concatenation. Bind the parameter and escape LIKE metacharacters.' },
    { cwe: 'CWE-770', owasp: 'A04:2021 Insecure Design', sev: 'Medium', cvss: 6.5, title: 'Historic position query is unbounded', where: 'StockController#at', fix: 'Replaying seven years of entries for a fast-moving SKU is a self-inflicted DoS on a 99.9% endpoint. Add periodic snapshots and replay only from the latest one.' },
    { cwe: 'CWE-209', owasp: 'A05:2021 Security Misconfiguration', sev: 'Low', cvss: 4.3, title: 'Stack traces returned on 500', where: 'Default error handler', fix: 'Responses expose package structure and library versions. Return a correlation id; log the detail server-side.' },
  ],
  findings: [
    { sev: 'High', kind: 'Concurrency defect', where: 'AllocationService#allocate:71', what: 'Read-then-write with no lock or conditional predicate. Reproducible under 20 concurrent requests for a single unit.', fix: 'Conditional UPDATE ... WHERE on_hand - allocated >= :qty, then check the affected row count.' },
    { sev: 'High', kind: 'Derived value stored', where: 'stock_position.available column', what: 'available is both stored and computed in different code paths, and they disagree after a failed transaction.', fix: 'Drop the column. BR-01 says derived; make the schema say it too, with a generated column or a view.' },
    { sev: 'High', kind: 'Cyclomatic complexity', where: 'MovementService#record — complexity 26', what: 'One method handles six movement kinds with nested conditionals and per-kind side effects.', fix: 'A MovementKind strategy per kind; the service resolves and delegates.' },
    { sev: 'Medium', kind: 'Missing idempotency', where: 'MovementController — receipt and pick', what: 'A handheld retry over a flaky WLAN books the movement twice; this is a known source of phantom stock.', fix: 'Require an Idempotency-Key header, unique in the ledger.' },
    { sev: 'Medium', kind: 'N+1 query', where: 'SuggestionService#open', what: 'On-order quantity fetched per suggestion; 500 suggestions is 501 queries and the buyer screen times out.', fix: 'One aggregate query joining open purchase orders.' },
    { sev: 'Medium', kind: 'Transaction scope', where: 'TransferService#transfer', what: 'The out and in entries are written in separate transactions; a failure between them destroys stock.', fix: 'One transaction. BR-09 already says atomic — the code does not implement it.' },
    { sev: 'Low', kind: 'Magic numbers', where: 'Expiry minutes, variance threshold and page size inline', what: 'Operational tuning requires a redeploy.', fix: 'An InventoryRules configuration bean.' },
  ],
  hardProblem: {
    title: 'Never overselling the last unit',
    body: 'Allocation sits directly in the order path at 60 requests per second, and it must be exactly right: if two customers are promised the same final unit, one of them gets a cancellation email, which is the failure the whole project exists to remove. A SELECT to check availability followed by an INSERT to reserve has a window between the two statements in which both requests see stock. Locking the SKU row serialises every order for a popular product at exactly the moment a promotion makes it popular.',
    solution: 'Make the check and the reservation one statement. `UPDATE stock_position SET allocated = allocated + :qty WHERE sku_id = :sku AND location_id = :loc AND on_hand - allocated >= :qty` either affects one row or none, atomically, at read-committed isolation. Zero rows means insufficient stock — return 409. There is no window, no application-held lock, and no serialisation beyond the row itself, so unrelated SKUs never contend. The same predicate is the definition of availability in BR-01, so the invariant is enforced in exactly one place rather than restated in application code that can drift.',
  },
  metrics: [
    { k: 'SKUs', v: '45,000' }, { k: 'Distribution centres', v: '3' },
    { k: 'Stores served', v: '180' }, { k: 'Oversell cancellations / quarter', v: '3,100' },
    { k: 'Peak allocations / s', v: '60' }, { k: 'Ledger entries / day', v: '~400k' },
  ],
};

/* ------------------------------------------------------------------ 06 */
const enrolment: Brief = {
  id: 'enrolment',
  title: 'Student Enrolment & Timetabling',
  short: 'Enrolment & Timetabling',
  domain: 'Higher education',
  stack: 'Python, FastAPI, PostgreSQL, Celery',
  stackList: ['Python 3.12', 'FastAPI', 'PostgreSQL 15', 'Celery', 'Redis', 'Alembic'],
  summary: '14,000 students choosing modules against finite room and staff capacity.',
  requirement: `Our university enrols about 14,000 students across 60 programmes and module selection is chaos. Enrolment opens at 09:00 on a single day, everyone hits it at once, popular modules fill in seconds, and every year we manually untangle hundreds of students with impossible timetables.

What we need
- A module catalogue: each module has a code, credit value, a teaching pattern (lectures, seminars, labs each with a frequency and duration), a capacity, and prerequisites expressed against other modules.
- Programme rules: each programme specifies how many credits a student must take per term, which modules are compulsory, and which optional pools they choose from and how many from each.
- Enrolment: a student selects modules. The system must validate prerequisites, credit totals, programme rules, capacity, and — critically — that the resulting timetable has no clash. A clash means two teaching events for the same student at overlapping times.
- Waiting lists: when a module is full a student may join a waiting list. If a place frees, the next eligible student on the list is offered it and has 24 hours to accept.
- Timetabling: the timetable is generated centrally before enrolment opens, assigning each teaching event a room and a slot. Rooms have capacities and features (lab benches, projectors). We are not asking you to write an optimiser — assume the schedule is imported — but enrolment must respect it and detect clashes against it.
- Staff view: module leaders see their enrolled cohort and can export a register.

Who uses it: students (select and change modules), academic advisors (approve exceptions, override prerequisites with a reason), timetabling office (import and amend the schedule), module leaders (view cohort, export registers), and registry (reporting and audit).

Non-functional. 14,000 students, but the load is extremely peaky — we expect 6,000 concurrent sessions in the first ten minutes, and several hundred requests per second against the popular modules. Capacity must never be exceeded, even under that load. A student's enrolment must be atomic: either every selected module is taken or none is, because a partial enrolment produces exactly the impossible timetables we are trying to eliminate. Enrolment history is retained for the student's lifetime plus 6 years for degree verification.

Out of scope: timetable optimisation itself, room booking outside teaching, fee calculation, accommodation, and anything to do with assessment or grades.`,
  actors: [
    { name: 'Student', can: 'Browse the catalogue, select and change modules within the enrolment window, join and leave waiting lists.' },
    { name: 'Academic advisor', can: 'Approve exceptions, override a prerequisite with a recorded reason, enrol a student outside the window.' },
    { name: 'Timetabling office', can: 'Import and amend the teaching schedule; must be warned when an amendment would clash for already-enrolled students.' },
    { name: 'Module leader', can: 'View the enrolled cohort and waiting list for their modules; export a register.' },
    { name: 'Registry', can: 'Reporting and audit across all programmes; read-only on enrolment data.' },
  ],
  entities: [
    { name: 'Module', fields: ['id: UUID', 'code: str', 'title: str', 'credits: int', 'capacity: int', 'prerequisites: PrereqExpr', 'termId: UUID'], note: 'Prerequisites are an expression tree — (A AND B) OR C — not a flat list.' },
    { name: 'TeachingEvent', fields: ['id: UUID', 'moduleId', 'kind: LECTURE|SEMINAR|LAB', 'dayOfWeek', 'start: time', 'durationMinutes: int', 'roomId', 'weeks: WeekPattern'], note: 'weeks matters: two events sharing a slot in different weeks do not clash.' },
    { name: 'Programme', fields: ['id: UUID', 'name: str', 'creditsPerTerm: int', 'compulsory: List[ModuleRef]', 'pools: List[OptionPool]'], note: 'A pool is "choose N from this set".' },
    { name: 'Enrolment', fields: ['id: UUID', 'studentId', 'moduleId', 'termId', 'state: ENROLLED|WITHDRAWN|WAITLISTED', 'enrolledAt: datetime'], note: 'One row per student-module-term; the unique constraint prevents double enrolment.' },
    { name: 'WaitlistEntry', fields: ['id: UUID', 'moduleId', 'studentId', 'position: int', 'offeredAt: datetime?', 'offerExpiresAt: datetime?'], note: 'Position is maintained on insert and on removal; the offer window is 24h.' },
    { name: 'Student', fields: ['id: UUID', 'programmeId', 'yearOfStudy: int', 'completedModules: Set[ModuleRef]'], note: 'completedModules is what prerequisite expressions evaluate against.' },
  ],
  rules: [
    { id: 'BR-01', text: 'A student may not enrol on a module whose prerequisite expression evaluates false against their completed modules, unless an advisor override exists.' },
    { id: 'BR-02', text: 'Enrolled credits per term must equal the programme\'s creditsPerTerm exactly at submission — not more, not less.' },
    { id: 'BR-03', text: 'All compulsory modules for the programme and year must be included.' },
    { id: 'BR-04', text: 'Each option pool must be satisfied exactly: choose N from the pool, no more, no fewer.' },
    { id: 'BR-05', text: 'No two teaching events in a student\'s selection may overlap in time in a week they share.' },
    { id: 'BR-06', text: 'Enrolled headcount for a module must never exceed its capacity, under any concurrency.' },
    { id: 'BR-07', text: 'A submission is atomic: every module is enrolled or none is.' },
    { id: 'BR-08', text: 'When a place frees, the earliest eligible waitlist entry is offered it and expires in 24 hours; expiry passes to the next.' },
    { id: 'BR-09', text: 'An advisor override records the advisor, the rule waived and a reason, and is visible on the student record.' },
    { id: 'BR-10', text: 'A schedule amendment that would create a clash for an enrolled student is refused, listing the affected students.' },
  ],
  nfrs: [
    { k: 'Peak concurrency', v: '6,000 concurrent sessions in the first 10 minutes' },
    { k: 'Submission latency', v: 'p95 < 1 s for a full 6-module submission including clash checking' },
    { k: 'Capacity correctness', v: 'Never exceeded, even at several hundred req/s on one module' },
    { k: 'Atomicity', v: 'A submission is all-or-nothing; partial enrolment is impossible' },
    { k: 'Availability', v: '99.9% during the enrolment window; degraded read-only is unacceptable' },
    { k: 'Retention', v: 'Enrolment history for lifetime + 6 years for degree verification' },
    { k: 'Fairness', v: 'Waitlist offers strictly in position order; no queue jumping' },
  ],
  risks: [
    { r: 'Capacity exceeded under the 09:00 stampede', i: 'Critical', mit: 'Conditional UPDATE incrementing enrolled_count only WHERE enrolled_count < capacity; zero rows means full. No read-then-write window.' },
    { r: 'Partial enrolment leaves an impossible timetable', i: 'Critical', mit: 'One transaction per submission covering every module; any failure rolls the whole submission back.' },
    { r: 'Clash detection too slow inside the transaction', i: 'High', mit: 'Teaching events for a term are loaded into an interval index in Redis; the check is in-memory over ~6 modules, not a database join per pair.' },
    { r: 'Thundering herd collapses the database', i: 'High', mit: 'Connection pool bounded well below the concurrency, a queue in front of submission, and the catalogue served from cache — reads must not compete with writes.' },
    { r: 'Waitlist offers race when several places free at once', i: 'Medium', mit: 'Offers issued by a single serialised worker per module, not by the request thread.' },
    { r: 'Prerequisite expressions become unmaintainable', i: 'Medium', mit: 'A small parsed expression tree with a pure evaluator and property tests, not free-text rules.' },
  ],
  unknowns: [
    'Can a student exceed creditsPerTerm with advisor approval, or is it a hard equality?',
    'When a schedule amendment would clash, who resolves it — the timetabling office or the affected students?',
    'Is the waitlist offer window 24 hours including weekends?',
    'Do withdrawn modules free a place immediately, or at the end of the change window?',
    'Can an advisor override capacity as well as prerequisites?',
    'Are part-time students subject to the same exact-credit rule?',
  ],
  integrations: [
    'Student records system — source of truth for programme, year and completed modules',
    'University SSO (SAML/OIDC) — student and staff identity',
    'Timetabling system — schedule import (CSV/API), read-only in v1',
    'Email/notification service — waitlist offers and expiry warnings',
    'Reporting warehouse — nightly extract for registry',
  ],
  outOfScope: [
    'Timetable optimisation and room allocation', 'Non-teaching room booking', 'Fee calculation',
    'Accommodation', 'Assessment, grades and progression', 'Graduation and awards',
  ],
  stories: [
    { id: 'US-001', title: 'Browse the catalogue', as: 'a student', want: 'to see modules available to me with their teaching pattern', so: 'I can plan a selection', points: 3,
      ac: ['Only modules for my programme, year and term are listed', 'Each module shows credits, capacity, places remaining and its teaching events', 'Modules whose prerequisites I do not meet are marked, not hidden'],
      edge: ['The catalogue is served under peak load without competing with submissions', 'A module with no remaining places shows a waitlist option'] },
    { id: 'US-002', title: 'Validate a selection', as: 'a student', want: 'immediate feedback on whether my selection is legal', so: 'I fix problems before submitting', points: 8,
      ac: ['Validation reports credit total, missing compulsory modules, unsatisfied pools, failed prerequisites and clashes', 'Every failure names the specific rule and modules involved', 'Validation is side-effect free and does not hold capacity'],
      edge: ['Two events in the same slot but different week patterns do not clash', 'A selection exactly meeting every rule validates clean'] },
    { id: 'US-003', title: 'Submit an enrolment atomically', as: 'a student', want: 'my whole selection enrolled together or not at all', so: 'I never end up half enrolled', points: 13,
      ac: ['A valid submission enrols every module in one transaction', 'If any module is full at commit, nothing is enrolled and the full module is named', 'Concurrent submissions cannot take a module past capacity'],
      edge: ['Submitting twice enrols once', 'A submission racing the last place — exactly one student gets it', 'A crash mid-submission leaves no partial state'] },
    { id: 'US-004', title: 'Join a waiting list', as: 'a student', want: 'to queue for a full module', so: 'I get a place if one frees', points: 5,
      ac: ['Joining a full module creates a WaitlistEntry at the end of the queue', 'My position is visible and stable', 'Joining twice is idempotent'],
      edge: ['Leaving the list renumbers positions correctly', 'Joining a module I am enrolled on is refused'] },
    { id: 'US-005', title: 'Waitlist offer and expiry', as: 'the system', want: 'to offer a freed place to the next eligible student', so: 'places are filled fairly', points: 8,
      ac: ['A withdrawal offers the place to position 1, expiring in 24h', 'An expired offer passes to the next entry', 'An offer is only made to a student for whom the module still validates'],
      edge: ['Several places freeing at once are offered in order, not all to one student', 'A student whose timetable now clashes is skipped with a reason'] },
    { id: 'US-006', title: 'Advisor override', as: 'an academic advisor', want: 'to waive a prerequisite with a reason', so: 'genuine exceptions are possible without breaking the rules for everyone', points: 5,
      ac: ['An override records advisor, rule waived, reason and timestamp', 'The student can then enrol on that module', 'The override is visible on the student record and in audit'],
      edge: ['An override does not waive capacity or clash rules', 'An expired override no longer permits enrolment'] },
    { id: 'US-007', title: 'Schedule amendment safety', as: 'the timetabling office', want: 'to be warned when an amendment would clash for enrolled students', so: 'we do not break timetables retrospectively', points: 8,
      ac: ['An amendment creating a clash for any enrolled student is refused', 'The refusal lists affected students and the clashing modules', 'A forced amendment requires explicit confirmation and notifies those students'],
      edge: ['An amendment affecting no enrolled student applies immediately', 'An amendment moving an event within its own module does not self-clash'] },
    { id: 'US-008', title: 'Cohort register export', as: 'a module leader', want: 'my enrolled cohort as a register', so: 'I can take attendance', points: 3,
      ac: ['The register lists enrolled students for my modules only', 'CSV export matches the on-screen list', 'Waitlisted students are shown separately, not mixed in'],
      edge: ['A module with no enrolments exports headers only', 'A leader requesting another module\'s register gets 403'] },
  ],
  endpoints: [
    { m: 'GET', p: '/api/v1/catalogue', d: 'Modules available to the caller', role: 'STUDENT' },
    { m: 'POST', p: '/api/v1/selections/validate', d: 'Validate without enrolling', role: 'STUDENT' },
    { m: 'POST', p: '/api/v1/enrolments', d: 'Submit a selection atomically', role: 'STUDENT' },
    { m: 'DELETE', p: '/api/v1/enrolments/{id}', d: 'Withdraw from a module', role: 'STUDENT, ADVISOR' },
    { m: 'POST', p: '/api/v1/waitlist', d: 'Join a waiting list', role: 'STUDENT' },
    { m: 'POST', p: '/api/v1/waitlist/{id}/accept', d: 'Accept an offered place', role: 'STUDENT' },
    { m: 'POST', p: '/api/v1/overrides', d: 'Record an advisor override', role: 'ADVISOR' },
    { m: 'POST', p: '/api/v1/schedule/amend', d: 'Amend a teaching event', role: 'TIMETABLING' },
    { m: 'GET', p: '/api/v1/modules/{id}/register', d: 'Cohort register + CSV', role: 'MODULE_LEADER' },
  ],
  vulns: [
    { cwe: 'CWE-362', owasp: 'A04:2021 Insecure Design', sev: 'Critical', cvss: 8.2, title: 'Capacity check races under concurrent enrolment', where: 'EnrolmentService.submit', fix: 'count() then insert leaves a window; at 09:00 several hundred requests hit one module and capacity is exceeded by dozens. Use a conditional UPDATE on enrolled_count WHERE enrolled_count < capacity and treat zero rows as full.' },
    { cwe: 'CWE-639', owasp: 'A01:2021 Broken Access Control', sev: 'Critical', cvss: 8.1, title: 'Any student can withdraw any enrolment', where: 'EnrolmentController.withdraw', fix: 'The handler takes an enrolment id and deletes it with no ownership check. A student can withdraw a rival from a full module and take the place. Verify ownership or ADVISOR role.' },
    { cwe: 'CWE-285', owasp: 'A01:2021 Broken Access Control', sev: 'High', cvss: 7.1, title: 'Register export not scoped to the requesting leader', where: 'ModuleController.register', fix: 'Any authenticated staff member can export any cohort, which is personal data for 14,000 students. Scope to modules the caller leads.' },
    { cwe: 'CWE-770', owasp: 'A04:2021 Insecure Design', sev: 'High', cvss: 7.5, title: 'No rate limiting on validate or submit', where: 'All /api/v1 enrolment routes', fix: 'Validation is expensive and unauthenticated-adjacent; a script can deny the enrolment window to everyone. Per-subject limits plus a submission queue.' },
    { cwe: 'CWE-799', owasp: 'A04:2021 Insecure Design', sev: 'Medium', cvss: 5.9, title: 'Waitlist accept has no replay protection', where: 'WaitlistController.accept', fix: 'A replayed accept can consume a second freed place out of order. Make the offer token single-use.' },
    { cwe: 'CWE-532', owasp: 'A09:2021 Logging Failures', sev: 'Medium', cvss: 5.3, title: 'Student identifiers and selections logged at INFO', where: 'EnrolmentService.submit', fix: 'Module choices are personal data revealing disability adjustments in some cases. Log the enrolment UUID only.' },
  ],
  findings: [
    { sev: 'High', kind: 'Concurrency defect', where: 'EnrolmentService.submit:118', what: 'Capacity verified with a count query before insert; reproducible overshoot under 200 concurrent requests.', fix: 'Conditional UPDATE with the predicate in the WHERE clause; check rowcount.' },
    { sev: 'High', kind: 'Cyclomatic complexity', where: 'SelectionValidator.validate — complexity 34', what: 'Credits, compulsory, pools, prerequisites and clashes all in one function with early returns that skip later checks, so a student sees one error at a time.', fix: 'One validator per rule returning violations; the orchestrator collects all of them. This also fixes the poor error reporting.' },
    { sev: 'High', kind: 'Performance', where: 'ClashDetector.detect', what: 'Pairwise comparison querying teaching events per pair — O(n²) queries inside the submission transaction, holding locks under peak load.', fix: 'Load the term\'s events once into an interval tree; detection becomes in-memory over ~20 events.' },
    { sev: 'Medium', kind: 'Transaction scope', where: 'EnrolmentService.submit', what: 'Each module is enrolled in its own transaction, so a failure on module 5 leaves 4 enrolled — precisely the partial state BR-07 forbids.', fix: 'One transaction for the whole submission.' },
    { sev: 'Medium', kind: 'Missing null handling', where: 'PrereqEvaluator.evaluate:52', what: 'completedModules may be None for a first-year student; the expression walker dereferences it.', fix: 'Default to an empty set and add the first-year case to the tests.' },
    { sev: 'Medium', kind: 'Duplication', where: 'Week-pattern overlap logic in ClashDetector and ScheduleAmendService', what: 'Two implementations disagree on alternating-week patterns, so an amendment can create a clash the validator would have caught.', fix: 'One WeekPattern.overlaps used by both.' },
    { sev: 'Low', kind: 'Magic numbers', where: '24, 6, 120 inline for offer window, credits and page size', what: 'Policy constants not centralised.', fix: 'An EnrolmentRules settings object.' },
  ],
  hardProblem: {
    title: 'Six thousand students hitting one popular module at 09:00',
    body: 'Enrolment is the opposite of steady load: nothing, then a stampede, then nothing. Two invariants must hold through it. Capacity must never be exceeded, which a count-then-insert cannot guarantee. And a submission must be all-or-nothing across six modules, because a partial enrolment produces exactly the impossible timetable the project exists to eliminate. Doing both naively means holding a long transaction across six capacity checks and a clash computation while several hundred requests queue behind it.',
    solution: 'Shrink what happens inside the transaction, and let the database enforce capacity. Clash detection and rule validation run before the transaction opens, against an in-memory interval index of the term\'s teaching events — no locks held during the expensive part. Inside the transaction, each module is claimed with a single conditional UPDATE incrementing enrolled_count only while it is below capacity; zero affected rows means full, and the whole transaction rolls back naming that module. The transaction therefore holds only row locks, for the duration of six fast UPDATEs, and the all-or-nothing guarantee is the transaction itself rather than application compensation logic.',
  },
  metrics: [
    { k: 'Students', v: '14,000' }, { k: 'Programmes', v: '60' },
    { k: 'Peak concurrent sessions', v: '6,000' }, { k: 'Enrolment window', v: '1 day' },
    { k: 'Modules per student / term', v: '~6' }, { k: 'Retention', v: 'Lifetime + 6 years' },
  ],
};

export const CATALOG: Brief[] = [clinic, rooms, fleet, billing, warehouse, enrolment];

export const byId = (id: string): Brief =>
  CATALOG.find(b => b.id === id) ?? CATALOG[0];

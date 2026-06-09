# Epic-01: User Management & Authentication — Requirements

> **TASK-001** — Requirements analysis for the foundation epic (auth, multi-role RBAC,
> multi-tenancy, parent/child workflows, ShareLinks, availability, Super Admin tooling).

## Overview

Establish the platform foundation: a multi-role user system (Super Admin, Trainer,
Coach, Player/Parent) with email/password authentication, role-based access control,
multi-tenant data isolation, and supporting workflows (impersonation, soft delete,
GDPR delete, child purchase approval, availability management, portal branding).

This epic is **P0** and blocks Epics 02–07.

## Source

- `Task/Epics/Epic-01_User_Management_Authentication_SPEC.md` (14 user stories)
- Clarifying decisions captured during requirements analysis (see below)

## Resolved Clarifications

These resolve internal contradictions and open questions in the spec:

| # | Decision | Impact |
|---|----------|--------|
| D-1 | **Scope:** Whole epic analyzed in one document, with a phased implementation grouping. | All 14 user stories decomposed below. |
| D-2 | **Minor accounts:** Child sub-logins only — no standalone minor accounts. A child is a *profile* under a parent; a child "login" is a constrained sub-credential tied to the parent account. | Supersedes Q-01.05 (US-01.06). Auth model has no independent under-18 accounts. Resolves the Business-Rules vs US-01.06 contradiction. |
| D-3 | **Email verification:** Optional / non-blocking. Users can log in immediately; verification is encouraged (banner/reminder) but not enforced. | Resolves Q-01.05 (table). No verification gate on login. `email_verified` flag still tracked. |

---

## Functional Requirements

Mapped from user stories (US-01.01 … US-01.14). Priority: H/M/L.

### Authentication & Authorization

| ID | Requirement | Acceptance | Priority | Source |
|----|-------------|-----------|----------|--------|
| FR-001 | Email/password authentication (login/logout) | Valid creds → session issued; invalid → clear error | H | §3, BR auth |
| FR-002 | Role-based access control for 4 roles | Each role sees only permitted dashboard/features; enforced on FE + BE | H | §6, BR RBAC |
| FR-003 | Session management with expiry | Sessions expire after inactivity (timeout configurable — Q-01.07) | H | §9 |
| FR-004 | Password reset flow | Request → emailed link (1h expiry) → set new password | H | §3, BR |
| FR-005 | Email verification (non-blocking, per D-3) | Verification email sent (24h link); `email_verified` flag set on confirm; login not gated | M | §3, D-3 |
| FR-006 | Force password change on first login (temp password) | Trainer/temp-password users must reset on first login | M | US-01.01 |
| FR-007 | Login rate limiting (brute-force protection) | Repeated failures throttled/locked | H | §9, §13 |

### User Management (Super Admin)

| ID | Requirement | Acceptance | Priority | Source |
|----|-------------|-----------|----------|--------|
| FR-010 | Users tool — global user directory with tool-specific search & filters | List all users; paginated; search within tool | H | US-01.01, §3 |
| FR-011 | Create trainer account (Super Admin only) | Enter business/trainer/email/phone; temp password OR invite link; appears as Active | H | US-01.01 |
| FR-012 | Edit any user account/profile | Super Admin can edit user fields | M | §3 |
| FR-013 | Deactivate user (soft delete, history preserved) | Status → Inactive; cannot log in; visible in history; reactivatable | H | US-01.12 |
| FR-014 | Delete user (GDPR — PII anonymized, history preserved) | PII → "Deleted User"/anonymized; analytics totals intact; permanent; logged | H | US-01.13 |
| FR-015 | Impersonate user (except other Super Admins) | Confirm → switch view; sticky banner; exit returns to admin; expires 1h | H | US-01.07 |
| FR-016 | Impersonation audit logging | Who/whom/start/end/duration recorded; "Impersonation History" report | H | US-01.07 |

### Player / Parent

| ID | Requirement | Acceptance | Priority | Source |
|----|-------------|-----------|----------|--------|
| FR-020 | Register via ShareLink (trainer invitation) | New: create account + player profile + trainer association; existing: associate only | H | US-01.02 |
| FR-021 | Multi-trainer association with separated views | One account, multiple trainer associations; context switcher; isolated data per context | H | US-01.02, §9 |
| FR-022 | Parent registers as player (self-train) | Parent account is also a player ("Me" context) | M | US-01.03 |
| FR-023 | Parent creates child profile | Add child (name/age/gender/optional); trainer selection prompt; linked to parent | H | US-01.03 |
| FR-024 | Parent manages child-trainer associations (add/remove) | Add via ShareLink or "My Trainers"; remove cancels RSVPs + soft-deletes child data with that trainer | H | US-01.04 |
| FR-025 | Context switching UI | Parent sees "Me" + children; child sees own trainers only; context persists in session | H | US-01.02, US-01.04 |
| FR-026 | Child constrained sub-login (per D-2) | Child credential tied to parent; CAN view/RSVP(w/ approval); CANNOT add trainers/payment/purchase/delete | H | US-01.06, D-2 |
| FR-027 | ShareLink blocking for children | Child clicking new-trainer link → blocked + parent notified via email with registration CTA | H | US-01.06 |
| FR-028 | Child purchase approval — USD (always) | Child checkout → "Pending Parent Approval"; parent approve/deny/request-info; expires 48h | H | US-01.05 |
| FR-029 | Child purchase approval — tokens (per-child setting) | Setting "allow token spend w/o approval" (default OFF); OFF → approval flow; ON → instant + informational notice | H | US-01.05 |
| FR-030 | Player/Parent sets availability ("Best Times") per profile | Day/time grid; per-child availability; saved per profile | M | US-01.09 |
| FR-031 | Player profile management | Edit fields, upload photo (see FR-050) | M | US-01.11 |
| FR-032 | Camp-to-User conversion (Epic-08 integration) | After camp/eval submission → prompt to create account; pre-fill from submission; auto-assign trainer; or email ShareLink for later | M | §3 |

### Coach

| ID | Requirement | Acceptance | Priority | Source |
|----|-------------|-----------|----------|--------|
| FR-040 | Coach invited by trainer via unique ShareLink | Unique link (1 use, 7-day expiry); register → associate; status Pending/Active | H | US-01.08 |
| FR-041 | Coach assigned to exactly ONE trainer (enforced) | Cannot be active under multiple trainers; validation error if already active elsewhere | H | US-01.08, §9 |
| FR-042 | Coach sets "My Times" (recurring weekly availability) | Weekdays + time ranges; multiple slots/day | M | US-01.10 |
| FR-043 | Availability conflict warning with override | Assign at conflicting time → warning; trainer overrides w/ required reason; logged; coach not blocked | M | US-01.10 |
| FR-044 | Coach public profile management (bio, credentials) | Edit bio/credentials/certifications; public visibility checkbox | M | US-01.08, US-01.11 |

### Trainer

| ID | Requirement | Acceptance | Priority | Source |
|----|-------------|-----------|----------|--------|
| FR-050 | ShareLink generation (static for players, unique for coaches) | Static: unlimited, no expiry; unique: 1 use, 7-day expiry; usage tracked | H | US-01.02, US-01.08 |
| FR-051 | View player availability (planning tool) | See availability indicator; filter players by available day/time; summary on card | M | US-01.09 |
| FR-052 | Assign coaches to events with availability checks | Assignment honors FR-043 conflict flow | M | US-01.10 |
| FR-053 | Manage own organization users (multi-tenant scoped) | Trainer sees/manages only own org's players & coaches | H | §9 |
| FR-054 | Portal branding (logo upload + primary color) | PNG/JPG/SVG ≤2MB; color picker (hex); live preview; applied org-wide immediately | M | US-01.14 |

### Cross-cutting

| ID | Requirement | Acceptance | Priority | Source |
|----|-------------|-----------|----------|--------|
| FR-060 | Edit own profile (all roles) | Common + role-specific fields; email/role read-only; photo upload + thumbnail | M | US-01.11 |
| FR-061 | Profile photo upload to file storage | Upload, thumbnail generation, URL update | M | US-01.11, §5 |

---

## Non-Functional Requirements

| ID | Requirement | Metric | Source |
|----|-------------|--------|--------|
| NFR-001 | Dashboard load | < 2 s | §11 |
| NFR-002 | User list (10,000 users) | < 3 s with pagination | §11 |
| NFR-003 | Profile save | < 1 s | §11 |
| NFR-004 | ShareLink registration | < 2 s; 100 concurrent | §11, §12 |
| NFR-005 | Concurrency | 1,000 concurrent users | §10 (epic AC) |
| NFR-006 | Accessibility | WCAG 2.1 AA; keyboard nav; screen reader; contrast; focus indicators | §13 |
| NFR-007 | Mobile | Responsive; touch-friendly; mobile-optimized forms/uploads | §13 |
| NFR-008 | Availability queries | Fast with thousands of players | §12 |

---

## Security Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| SEC-001 | Passwords hashed (industry-standard, e.g. bcrypt/argon2) | §13 |
| SEC-002 | Secure session management (prevent token theft, XSS) | §13 |
| SEC-003 | CSRF protection on state-changing operations | §13 |
| SEC-004 | Rate limiting on auth endpoints | §13 |
| SEC-005 | Token expiry: email verify 24h, password reset 1h, impersonation 1h | §13 |
| SEC-006 | Audit logging for sensitive ops (impersonation, deletion, override) | §13 |
| SEC-007 | Multi-tenant isolation: 0% data leakage between trainer orgs | §2, §9 |
| SEC-008 | Super Admin cannot impersonate other Super Admins | US-01.07 |
| SEC-009 | Child sub-login permission constraints enforced server-side | US-01.06, D-2 |

---

## Business Rules

| ID | Rule | Source |
|----|------|--------|
| BR-001 | Email unique across all users | §9 |
| BR-002 | Exactly one role per user | §9 |
| BR-003 | Only Super Admin creates trainer accounts (no trainer self-registration) | §9 |
| BR-004 | Players register only via trainer ShareLink | §9 |
| BR-005 | Existing player + new ShareLink → new association, never duplicate account | §9 |
| BR-006 | Coach active under exactly ONE trainer at a time | §9 |
| BR-007 | All under-18 are parent-managed profiles; child login is a constrained sub-credential (D-2) | §9, D-2 |
| BR-008 | USD child purchases ALWAYS require parent approval | §9 |
| BR-009 | Token child spend requires approval unless per-child setting enabled (default OFF) | §9 |
| BR-010 | Approval requests expire after 48h (auto-deny + notify) | US-01.05 |
| BR-011 | Soft delete preserves all history; reactivatable | §9 |
| BR-012 | GDPR delete anonymizes PII permanently; analytics totals unchanged; not reversible | §9 |
| BR-013 | Static ShareLinks: unlimited uses, no expiry | §9 |
| BR-014 | Unique coach ShareLinks: 1 use, 7-day expiry | §9 |
| BR-015 | Availability is advisory (scheduling suggestion), not a hard restriction | §9 |
| BR-016 | Coach conflict override requires a reason and is logged | §9 |
| BR-017 | Age validation for children: 1–18 years | §9 |
| BR-018 | Each child has separate calendar/RSVP/availability **per trainer** | US-01.03 |

---

## Integration Points

| System | Purpose | Notes |
|--------|---------|-------|
| Email service | Transactional emails: welcome, password reset, email verify, trainer invite, coach invite, approval requests/results, ShareLink-blocked parent notice | Q-01.04 (full email list) open |
| File storage | Profile photos/avatars, trainer logos | Thumbnail generation for photos |
| Epic-08 (Camps/Eval) | Camp-to-User conversion (pre-fill registration, auto-assign trainer) | FR-032 |
| Epic-05 (Payments) | Trainer Stripe IDs, subscription, platform fee fields; child approval gates checkout | Fields stored now; payment logic in Epic-05 |
| Epic-06 (Marketing) | ShareLink usage analytics | Track usage counts/timestamps now |

---

## Task Breakdown

### Entities

| Entity | Key Properties | Relations |
|--------|----------------|-----------|
| User | email (unique), passwordHash, role, status (Active/Inactive/Deleted), emailVerified, lastLoginAt, timestamps | 1–1 Profile; 1–N associations |
| PasswordResetToken | token, userId, expiresAt (1h), usedAt | belongs to User |
| EmailVerificationToken | token, userId, expiresAt (24h), usedAt | belongs to User |
| TrainerProfile | businessName, orgDetails, stripeIds*, subscriptionStatus*, platformFeePct* (*Epic-05) | belongs to User |
| CoachProfile | bio, credentials, certifications, publicVisible, joinedTrainerAt | belongs to User; belongs to ONE Trainer |
| PlayerProfile | playerName, ageOrBirthDate, gender, skillLevel, school, jerseyNumber, isChild, parentUserId?, emergencyContact | belongs to User (or parent); N–N Trainers via association |
| ChildLogin (sub-credential) | childProfileId, credentials, permissionConstraints, tokenSpendAllowed (per-child) | tied to parent User (D-2) |
| TrainerPlayerAssociation | trainerId, playerProfileId, viaShareLinkId, connectedAt, status | links Trainer ↔ Player |
| ShareLink | code (URL-safe, unique), type (static/unique), trainerId, createdBy, targetEmail?, expiresAt?, maxUses?, useCount, active | belongs to Trainer |
| Availability (BestTimes) | subjectType (coach/player), subjectId, dayOfWeek, startTime, endTime, isAvailable, timestamps | belongs to Coach or PlayerProfile |
| ImpersonationLog | adminId, impersonatedUserId, startAt, endAt, duration, actions? | audit |
| PurchaseApproval | childProfileId, parentUserId, eventId, amount, paymentType (USD/token), status (pending/approved/denied/expired), expiresAt (48h), parentNotes, timestamps | approval workflow |
| CoachAvailabilityOverride | eventId, coachId, overriddenByTrainerId, reason (required), timestamp | audit |
| UserDeletionLog | originalUserId, originalEmail, deletedBy, reason, deletedAt, backupRef | GDPR compliance |
| PortalBranding | trainerId, logoUrl, primaryColorHex | belongs to Trainer |

### Services

| Service | Purpose | Key methods |
|---------|---------|-------------|
| AuthService | Login, logout, sessions, password reset, email verify, rate limiting | login, logout, requestReset, resetPassword, verifyEmail, forceChange |
| UserService | User CRUD, status transitions, GDPR delete | create, update, deactivate, reactivate, anonymizeDelete |
| ImpersonationService | Start/exit impersonation, audit | impersonate, exit, getHistory |
| ProfileService | Role-specific profiles, photo upload | getProfile, updateProfile, uploadPhoto |
| TrainerService | Trainer creation, org-scoped queries, branding | createTrainer, listOrgUsers, updateBranding |
| CoachService | Coach invite, single-trainer enforcement, availability | invite, accept, setMyTimes, updatePublicProfile |
| PlayerService | Registration, multi-trainer associations, child profiles, contexts | registerViaLink, addTrainer, createChild, manageChildTrainer, switchContext |
| ChildAccountService | Constrained sub-login, permission enforcement, ShareLink blocking | authenticateChild, enforceConstraints, blockShareLink |
| ApprovalService | Child purchase approvals (USD + token), expiry | requestApproval, approve, deny, expireStale |
| ShareLinkService | Generate/validate/track static & unique links | generateStatic, generateUnique, validate, recordUse |
| AvailabilityService | Best Times / My Times, conflict checks | setAvailability, getAvailability, checkConflict, override |
| AuditService | Centralized audit logging | logImpersonation, logDeletion, logOverride |
| EmailService (adapter) | Transactional emails | sendInvite, sendReset, sendVerify, sendApprovalRequest, sendChildBlocked |
| RbacGuard / PolicyService | Role + tenant + child-constraint enforcement | can(action, resource, context) |

### Controllers / Endpoints (indicative)

| Controller | Endpoints | Purpose |
|------------|-----------|---------|
| AuthController | POST /auth/login, /auth/logout, /auth/password-reset, /auth/password-reset/confirm, /auth/verify-email | Authentication |
| UsersController | GET /users, GET /users/:id, POST /users (trainer), PATCH /users/:id, POST /users/:id/deactivate, /reactivate, DELETE /users/:id | Super Admin user mgmt |
| ImpersonationController | POST /impersonation/:userId, POST /impersonation/exit, GET /impersonation/history | Impersonation + audit |
| ProfileController | GET/PATCH /me/profile, POST /me/profile/photo | Self profile |
| TrainersController | POST /trainers, GET /trainers/:id/users, PUT /trainers/:id/branding | Trainer org + branding |
| CoachesController | POST /coaches/invite, POST /coaches/accept, PUT /coaches/me/availability, PUT /coaches/me/profile | Coach lifecycle |
| PlayersController | POST /join/:code, POST /players/:id/trainers, POST /players/:id/children, PATCH /children/:id/trainers, GET/PUT /players/:id/availability, GET /players/contexts | Player/parent flows |
| ApprovalsController | GET /approvals, POST /approvals/:id/approve, /deny, PATCH /children/:id/token-setting | Child purchase approvals |
| ShareLinksController | POST /sharelinks, GET /sharelinks, GET /sharelinks/:code/validate | ShareLink mgmt |

### Frontend (components / state / integration)

| Area | Components | State | API |
|------|------------|-------|-----|
| Auth | LoginPage, RegistrationPage (player + parent/child option), PasswordReset, EmailVerifyBanner | auth/session store, current role | FR-001/004/005 endpoints |
| Super Admin | UsersList (paginated, search/filter), CreateUserModal, ConfirmDeactivate/DeleteModal, ImpersonationBanner (sticky, color-coded) | users list, filters, impersonation mode | UsersController, ImpersonationController |
| Player/Parent | PlayerProfilesList, AddChildModal (trainer selection), ContextSwitcher (Me + children), PendingApprovalsList, BestTimesGrid | active context, children, approvals | PlayersController, ApprovalsController |
| Child view | Constrained nav, ShareLink-blocked message, child ContextSwitcher (trainers only) | child session, permission flags | ChildAccountService endpoints |
| Coach | MyTimesGrid, PublicProfileEdit | availability, profile | CoachesController |
| Trainer | ShareLinkModal, PlayerAvailabilityView/filter, CoachAssign (conflict warning + override), BrandingSettings (logo upload, color picker, live preview) | org users, branding, sharelinks | TrainersController, ShareLinksController, AvailabilityService |
| Shared | ProfileEdit (all roles, role-specific fields), PhotoUpload | profile store | ProfileController |

### Testing Tasks

- **Unit:** AuthService (hashing, token expiry, rate limit), ApprovalService (USD vs token, expiry), ShareLinkService (static vs unique, use limits), RbacGuard (role + tenant + child constraints), ImpersonationService (Super-Admin block).
- **Integration:** auth endpoints, user CRUD + status transitions, GDPR anonymization, ShareLink registration (new + existing account), coach single-trainer enforcement, impersonation audit.
- **E2E (key scenarios, §12):** ShareLink registration (new/existing); multi-trainer association; parent creates child → child requests purchase → parent approves; Super Admin create-trainer → impersonate → exit; coach invite (expiry/single-use); coach availability override; deactivation preserves history; GDPR delete anonymizes; Best Times set/viewed; ShareLink expiry/usage limits.
- **Security:** cross-role access denial, cross-trainer isolation, coach multi-trainer block, Super-Admin-impersonation block, anonymization correctness, login rate limiting, session security.
- **Performance:** dashboard <2s, user list 10k <3s, profile save <1s, ShareLink 100 concurrent.

---

## Suggested Phased Implementation

Within this single epic, recommended build order (mirrors §13 + dependency reality):

1. **Phase A — Auth foundation:** FR-001/003/004/005/007, SEC-001..006, RbacGuard (FR-002).
2. **Phase B — User management core:** FR-010..014, FR-060/061 (profiles + photo), multi-tenant scoping (FR-053, SEC-007).
3. **Phase C — ShareLink & invitations:** FR-050, FR-020, FR-040/041, FR-006.
4. **Phase D — Player/Parent family:** FR-021..029, FR-032 (camp conversion), child sub-login + constraints + approvals.
5. **Phase E — Availability:** FR-030/042/043/051/052.
6. **Phase F — Super Admin tooling:** FR-015/016 (impersonation + audit).
7. **Phase G — Branding + polish:** FR-054, accessibility (NFR-006), mobile (NFR-007), perf hardening.

---

## Gap Analysis

### Resolved Gaps (GR1–GR4, 2026-06-09)

| ID | Resolution |
|----|------------|
| **Q-01.01** ✅ | `SkillLevel` enum `BEGINNER\|INTERMEDIATE\|ADVANCED\|ELITE`; Postgres enum column on `PlayerProfile.skillLevel`; `@IsEnum(SkillLevel)` on UpdateProfileDto; migration GR1. |
| **Q-01.02** ✅ | Store `dateOfBirth` (ISO date) on `PlayerProfile`; derive `age` + `ageGroup` (U6/U8/U10/U12/U14/U16/U18) at read via pure `age.util.ts`. Drop `age` integer. `CreateChildDto` validates derived age 1–18 (BR-017). Migration GR2 adds `date_of_birth`, drops `age`. |
| **Q-01.04** ✅ | Nodemailer SMTP adapter + full `TemplateRegistry` (10 templates: welcome, password-reset, email-verify, trainer-invite, coach-invite, approval-request, approval-result approved/denied, child-sharelink-blocked, availability-override). Provider selection via `EMAIL_PROVIDER` env; default=log keeps tests green. |
| **Q-01.06** ✅ | `NotificationsModule` added: `Notification` entity (AVAILABILITY_OVERRIDE\|GENERAL); `GET /api/v1/notifications`; `POST /api/v1/notifications/:id/read`. `AvailabilityService` override path creates in-app notification + sends override email (best-effort). Migration GR4 adds `notifications` table. |

### Epic Boundary Decisions (no code change in Epic-01)

| Gap | Decision | Contract |
|-----|----------|----------|
| **Epic-05 (payment fields)** | `TrainerProfile.stripeAccountId` stays as nullable placeholder; Epic-05 owns all payment business logic. Epic-01 stores, never writes payment data. | Boundary: Epic-05 implementors may add stripe/subscription/fee columns to `trainer_profiles`; do not modify Epic-01 profile entities without Epic-05 coordination. |
| **Epic-08 (camp→registration mapping)** | `JoinViaLinkDto` carries registration fields as-is (email, password, playerName, age, gender). Epic-08 will map camp/eval submission → those fields for pre-fill. `JoinViaLinkDto.age` remains until Epic-08 mapping ships; `PlayerProfile.dateOfBirth` is the canonical storage. | Boundary: Epic-08 implementors will source `dateOfBirth` from camp form and pass it in a new field; `age` in JoinViaLinkDto is an interim bridge. |

### Remaining Open Items

- [ ] **Q-01.07 (P2):** Session timeout duration (1d / 7d / 30d?). Affects NFR-003/SEC-002. Default assumed pending answer.
- [ ] **Camp-to-User (FR-032):** Epic-08 will implement field mapping (see boundary above).
- [ ] **Token economy:** "Tokens" referenced (child token spend) but token issuance/balance model not defined in this epic — confirm source epic.
- [ ] **Reactivation of deleted child data:** US-01.04 soft-deletes child↔trainer data on removal — confirm whether re-adding restores history or starts fresh.

**Previously resolved (no longer gaps):** minor account model (D-2), email verification gating (D-3), epic scope (D-1), Q-01.01/02/04/06 (see above).

---

## Next Steps (Suggested — not auto-executed)

- **Next by flow:** `/brainstorm [TASK-001]` — refine these requirements into a concrete design (data model details, context-switching UX, approval state machine) through collaborative dialogue.
- **Alternative:** `/architect [TASK-001]` — jump to architecture decisions (auth strategy, multi-tenancy enforcement pattern, module boundaries) since requirements are well-defined.
- **Alternative:** `/writing-plans [TASK-001]` — produce a phased implementation plan (Phases A–G above) if design is already settled.

**Context handoff:** "TASK-001: Epic-01 User Management & Authentication requirements analyzed — 14 user stories decomposed across auth/RBAC, Super Admin mgmt, player/parent family workflows, coach lifecycle, trainer tooling. Decisions: whole-epic scope, child sub-logins only, non-blocking email verification. 9 open gaps flagged (mostly P1/P2 client questions)."

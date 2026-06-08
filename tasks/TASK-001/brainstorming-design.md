# Epic-01: Authentication, Session & Family-Account Design

> **TASK-001** — Design refinement of the Epic-01 foundation (auth, sessions, RBAC,
> multi-tenancy, parent/child workflows, ShareLinks, approvals).
> Derived from `requirements-analyst-requirements.md` through collaborative brainstorming.
>
> **Status:** ✅ FINALIZED. Q1–Q4 (auth + session), Q5/Q5b (ShareLinks), Q6 (approvals),
> and Q7 (delete model) all settled. All load-bearing decisions captured. Ready for
> `/architect` or `/writing-plans`.

## Problem Statement

Establish a secure, multi-role authentication and session foundation that supports:
multi-tenant trainer organizations, Super Admin impersonation, parent accounts that
own constrained child sub-logins, multiple trainer associations per player with isolated
context switching, and downstream approval/ShareLink workflows. This foundation is P0
and blocks Epics 02–07.

## Resolved Design Decisions (Q1–Q4)

### Q1–Q3 — Authentication model (settled)

- **Auth method:** Email/password (FR-001), passwords hashed with an industry-standard
  algorithm (SEC-001). Force-password-change on first login for temp-password users (FR-006).
- **RBAC:** Exactly one role per user (BR-002); 4 roles (Super Admin, Trainer, Coach,
  Player/Parent). Enforced server-side via guard/policy layer (FR-002, SEC-009).

### Q2 / Q4 — Session model (settled — Q4 confirmed as **4a**, identical to Q2)

- **Server-side sessions.** Opaque session identifier in an **httpOnly cookie** (not a JWT
  in the client). Session records persisted in a **Postgres session store** (now, not Redis).
- **Implementation:** **Passport + express-session** (`@nestjs/passport` + `express-session`)
  backed by a **Postgres session-store adapter** (e.g. `connect-pg-simple` or equivalent).
- **Cookie hardening:** httpOnly, Secure, SameSite; CSRF protection on state-changing
  operations (SEC-002, SEC-003).

#### Session timeout policy (resolves Q-01.07 / FR-003)

| Parameter | Default | Notes |
|-----------|---------|-------|
| Absolute max lifetime | **30 days, sliding/rolling** | Refreshed on activity (rolling renewal). |
| Idle timeout | **~14 days inactivity → logout** | Independent of absolute max. |
| Impersonation session cap | **1 hour, hard** | Regardless of activity (SEC-005, FR-015). |

All timeouts are **configurable**; ship the defaults above.

#### Session payload design (must carry)

The server-side session record must persist three concern groups:

- **(a) Impersonation pair** — `realAdminId` + `impersonatedSubjectId` + `impersonationStartedAt`
  (drives the hard 1h cap and the sticky banner; feeds ImpersonationLog per FR-016).
- **(b) Child-under-parent principal** — the constrained child principal tied to the parent
  account (per D-2 / BR-007): which child profile is authenticated, the parent account it is
  bound to, and the permission-constraint flags (FR-026, SEC-009).
- **(c) Active context** — which "Me"/child profile is active **and** which trainer
  association is active (per FR-021 / FR-025). Context persists in the session and drives
  data isolation between trainer views.

## Architecture (auth/session slice)

- **Layered NestJS:** Controller → Service → Repository.
- `AuthModule` wires Passport strategies (local for login) + `express-session` middleware
  with the Postgres store adapter.
- `SessionContextService` reads/writes the active-context and impersonation/child segments
  of the session payload; consumed by `RbacGuard`/`PolicyService` for per-request decisions.

## Open Questions (carried)

- Q5 (this turn): ShareLink system vs child purchase approval state machine — see below.
- Q-01.04, Q-01.01, Q-01.02, Q-01.06 remain open per requirements gap analysis.

---

## Q5 — ShareLink system

### Q5a — Code format (**LOCKED — do not reopen**)

**Final decision:** The URL `code` is an **opaque, random, URL-safe token** generated
from a **CSPRNG with high entropy** (e.g. 32 bytes from `crypto.randomBytes` → base64url,
≈256 bits). The token is **not signed** and carries **no embedded metadata** — it is a
pure unguessable lookup key.

**The `ShareLink` DB row is the single source of truth** for every authoritative property:
`type` (static/unique), `expiresAt`, `useCount`, `maxUses`, `active`, and all analytics.
No property is derivable from the token itself; every validation is a DB lookup by `code`.

**Rationale (why opaque-random over signed token):**

- **No client-side trust surface.** Nothing in the token is interpretable or forgeable;
  there is no signature to verify, no secret to rotate, no risk of stale embedded claims
  (e.g. an embedded `expiresAt` disagreeing with the row after an admin edits expiry).
- **Revocation is trivial and immediate** — flip `active = false`; the next lookup fails.
  A signed stateless token cannot be revoked before its embedded expiry.
- **Single source of truth** eliminates the embedded-vs-row reconciliation problem that
  the earlier hybrid approach had to paper over.
- **High entropy** makes brute-force enumeration infeasible; combined with the `active`
  flag and `expiresAt`, this satisfies the security posture without signing.

**Revocation = flip `active`.** All link states (revoked, expired, exhausted) are resolved
against the row at validation time.

**Performance note (NFR-004: 100 concurrent, <2s):** Validation is a single indexed lookup
on `code` (unique index). Cheap rejection of garbage codes is still O(1) via the index miss;
we do not need pre-DB signature checks. Index `ShareLink.code` (unique) and keep validation
on the hot path read-only until the consumption transaction (unique links only).

### Q5b — Validation & registration flow + edge cases (**settled**)

**Endpoint shape (per requirements §components):**
`GET /sharelinks/:code/validate` (read-only preview) and the registration `POST` that
actually consumes/associates. Validation is always re-run inside the registration
transaction — the preview result is advisory and never trusted for the write.

#### Validation pipeline (single ordered gate, all against the DB row)

1. **Lookup** `code` → row. Miss ⇒ `404 invalid link` (generic; do not leak existence).
2. **`active === false`** (revoked) ⇒ `410 Gone — link revoked`.
3. **`expiresAt != null && expiresAt < now`** ⇒ `410 Gone — link expired`.
4. **Unique type & `useCount >= maxUses`** ⇒ `410 Gone — link already used`
   (resend path, see below). Static links skip this (BR-013 unlimited).
5. **Child-principal guard (FR-027)** — if the authenticated principal is a constrained
   child sub-login, **block** before any association and **email the parent** with a
   registration CTA (see below). Never auto-associate a child.
6. Pass ⇒ proceed to registration/association branch.

#### Edge case A — expired / used unique coach link → resend (US-01.08, FR-040)

- A consumed or expired **unique** link is **terminal**; we do **not** reactivate it.
- The block page surfaces a **"Request a new link"** action. This signals the inviting
  trainer (and/or notifies via the email service) to **generate a fresh unique link**
  (`generateUnique`) to the same `targetEmail`, with a new 7-day `expiresAt` and
  `useCount = 0`. The old row stays in history for analytics (Epic-06).
- Resend is **idempotent per outstanding invite**: generating a new unique link to a
  `targetEmail` that already has an unconsumed, unexpired unique link should **reuse /
  refresh** rather than spawn duplicates (prevents multiple live links per coach invite).

#### Edge case B — already-associated player → never duplicate (BR-005, FR-020)

- On registration, branch on **authenticated vs anonymous**:
  - **Anonymous / new:** create `User` + `PlayerProfile` + `TrainerPlayerAssociation`.
  - **Existing logged-in player:** create **only** a new `TrainerPlayerAssociation`
    (no new account — BR-005).
- **Duplicate-association guard:** before insert, check for an existing
  `TrainerPlayerAssociation(trainerId, playerProfileId)`. If one exists:
  - status `Active` ⇒ **no-op**, return "already connected to this trainer."
  - status soft-deleted/removed ⇒ **reactivate** the existing row (do not insert a second).
- Enforce a **unique constraint on `(trainerId, playerProfileId)`** so the DB rejects
  duplicates even under a race; treat the constraint violation as the "already associated"
  outcome (read-after-conflict).

#### Edge case C — revoked link (`active = false`)

- Covered by gate step 2 ⇒ `410 Gone`. No consumption, no association. Revocation is the
  only mechanism that invalidates an otherwise-valid static link early.

#### Edge case D — child clicks a new-trainer link (FR-027)

- Gate step 5 blocks. Response = friendly **"ask a parent"** screen (no association, no
  account mutation). System sends a **transactional email to `parentUserId`'s account**
  containing the trainer/link context and a **registration CTA** so the parent can add the
  trainer on the child's behalf (FR-024). Logged for audit.

#### Edge case E — single-use race condition (FR-040, BR-014)

- Consumption of a **unique** link is an **atomic check-and-increment inside one
  transaction**, expressed as a **conditional UPDATE**:

  ```sql
  UPDATE share_link
     SET use_count = use_count + 1
   WHERE code = :code
     AND active = true
     AND (expires_at IS NULL OR expires_at > now())
     AND use_count < max_uses
  RETURNING id;
  ```

  - **Exactly one** concurrent request gets a row back (`rowCount = 1`) and proceeds to
    create the association **in the same transaction** (consume + associate are atomic;
    rollback on association failure releases the use).
  - All losers get `rowCount = 0` ⇒ treated as "link already used" (edge case A path).
- This makes the check-and-increment a single atomic statement — no read-then-write window,
  no application-level lock needed. The unique index on `code` keeps it a point update.
- **Static links** are not consumption-limited: their `useCount` is incremented for
  **analytics only** (best-effort, can be a fire-and-forget / async increment so it never
  blocks or fails the registration hot path — supports NFR-004).

---

## Q6 — Child purchase approval state machine (**settled — Option A**)

**Final decision:** A **dedicated `ApprovalRequest` entity with an explicit state machine**
(chosen over piggy-backing approval state onto the order/checkout row). The entity owns the
lifecycle, the 48h expiry timer, the audit trail, and the payment-type branch.

### State machine

```
                 ┌──────────── parent approves ──────────► Approved  (terminal)
                 │
   create ─► Pending ─── parent denies ──────────────────► Denied    (terminal)
                 │
                 ├──── 48h elapsed (scheduler) ──auto-deny─► Expired   (terminal)
                 │
                 └──── child/parent cancels checkout ──────► Cancelled (terminal)
```

- **States:** `Pending → { Approved | Denied | Expired | Cancelled }`. All non-Pending
  states are **terminal** (no resurrection; a new checkout creates a new `ApprovalRequest`).
- **Pending** is the only actionable state. Transitions out of Pending are guarded so that a
  late parent action on an already-`Expired` row is rejected (idempotent, race-safe).
- **`Expired`** is produced by a scheduler (auto-deny + notify), distinct from a manual
  `Denied` so analytics/audit can tell "parent said no" from "parent never responded."
- **`Cancelled`** covers child or parent abandoning the checkout before resolution; keeps a
  clean audit distinct from a denial.

### Expiry (BR-010 / FR-028)

- **48 hours**, auto-deny + notify (NOT 7 days). `expiresAt = createdAt + 48h`.
- A **scheduled sweep** (cron/worker) transitions stale `Pending` rows → `Expired`, fires
  the parent + child notifications, and releases any held checkout. The transition is a
  guarded conditional UPDATE (`WHERE status = 'Pending' AND expiresAt < now()`) so it is
  idempotent and safe under concurrent parent action.

### Payment-type branch (FR-028 / FR-029, BR-008 / BR-009)

`ApprovalRequest.paymentType ∈ { USD, TOKEN }` drives whether a row is even created:

| Scenario | Per-child `allowTokenSpendWithoutApproval` | Behavior |
|----------|--------------------------------------------|----------|
| **USD purchase** | (ignored) | **Always** create `Pending` `ApprovalRequest` (BR-008). |
| **TOKEN purchase** | **OFF** (default) | Create `Pending` `ApprovalRequest` (normal flow). |
| **TOKEN purchase** | **ON** | **Instant** spend; **no Pending row**. Emit an **informational notification** to the parent. Record as an **auto-approved / informational `ApprovalRequest`** (`status = Approved`, `autoApproved = true`, no parent action, no 48h timer) so the spend still appears in approval history/audit. |

- The per-child flag lives on the child sub-login (`ChildLogin.tokenSpendAllowed`, default
  `false`), toggled by the parent via `PATCH /children/:id/token-setting`.
- **Design call (captured):** prefer writing an **auto-approved informational record** over
  writing nothing, so token spends are uniformly auditable and the parent's approval-history
  view is complete. The record carries `autoApproved = true` and skips the expiry scheduler.

### Entity shape (refines `PurchaseApproval` from requirements)

`ApprovalRequest { id, childProfileId, parentUserId, eventId/orderRef, amount,
paymentType (USD|TOKEN), status (Pending|Approved|Denied|Expired|Cancelled),
autoApproved (bool), expiresAt (48h, null when autoApproved), resolvedAt, resolvedBy,
parentNotes, createdAt, updatedAt }`.

- Index `(status, expiresAt)` for the cheap expiry sweep; index `(parentUserId, status)` and
  `(childProfileId, status)` for the parent's pending/queue views.

---

## Q7 — User delete model (**settled — Option B**)

### Decision (sub-decision i): two orthogonal mechanisms, not one status enum

**Final decision:** Separate the **reversible deactivate/reactivate cycle** from the
**irreversible GDPR scrub** using two independent fields:

- **`status ∈ { Active, Inactive, Deleted }`** drives the reversible lifecycle.
  `Active → Inactive` (deactivate, BR-011/FR-013) and `Inactive → Active` (reactivate) is a
  normal, lossless toggle. `Inactive` users cannot log in but retain all PII and history.
- **`anonymizedAt` (nullable timestamp)** marks the **irreversible GDPR scrub**
  (BR-012/FR-014). When a GDPR delete runs: PII is anonymized in place, `anonymizedAt` is set
  to `now()`, and `status` is set to `Deleted`.

**Reactivation guard:** `reactivate()` rejects when `anonymizedAt != null`. A scrubbed row can
never return to `Active` — the anonymization is terminal, so there is no PII to restore. This
cleanly separates "temporarily disabled, fully restorable" from "permanently scrubbed."

**FKs preserved (BR-012):** The `User` row and **all foreign keys are never deleted**. The row
stays in place so analytics aggregates, historical orders, associations, and audit records
remain referentially intact. Only the PII *columns* are overwritten.

### Field-level anonymization (sub-decision ii — given by US-01.13, folded in)

On GDPR delete, the following columns are overwritten in place:

| Field | Anonymized value |
|-------|------------------|
| Name | `"Deleted User"` |
| Email | `deleted_[user_id]@example.com` |
| Phone | `NULL` |
| Photo | default avatar (reset to platform default URL) |
| Other personal identifiers (school, jersey #, emergency contact, bio, etc.) | `NULL` |

### Why analytics totals stay intact

The row and its FKs never leave the database (BR-012). Aggregate queries (counts, revenue
totals, association histories) continue to include the scrubbed user's contributions; only the
*rendered* identity changes. Any historical record that joins to this user renders the
anonymized values (`"Deleted User"`, default avatar) rather than a broken/missing reference.

### `UserDeletionLog` (legal compliance audit)

Every GDPR delete writes a `UserDeletionLog` row capturing the pre-scrub identity for legal
defensibility (separate, access-controlled store):

`UserDeletionLog { originalUserId, originalEmail, deletedBy, reason, deletedAt, backupRef }`

- `originalEmail` preserved here (not in `User`) so compliance can answer "who was this" while
  the live `User` row carries only the anonymized address.
- `backupRef` points to the off-system legal backup/export (retention-policy artifact).
- Written in the **same transaction** as the anonymization so the audit can never diverge from
  the scrub.

### Service shape (refines `UserService`)

`UserService.deactivate(id)` → `status = Inactive` (guarded: not already Deleted).
`UserService.reactivate(id)` → `status = Active` (guarded: **reject if `anonymizedAt != null`**).
`UserService.anonymizeDelete(id, deletedBy, reason)` → single transaction: overwrite PII
columns, set `anonymizedAt = now()`, `status = Deleted`, write `UserDeletionLog`. Idempotent:
re-running on an already-anonymized row is a no-op (guard on `anonymizedAt`).

---

## Q8 — Impersonation audit (**settled — bracket + dual-actor attribution**)

Captured here for completeness (load-bearing, no further sub-questions):

- **Bracketed log:** `ImpersonationLog` records the full bracket — `adminId`,
  `impersonatedUserId`, `startAt`, `endAt`, `duration`. Start writes the open bracket; exit (or
  the 1h hard cap from the session layer) closes it. Drives the "Impersonation History" report
  (FR-016, SEC-006).
- **Dual-actor write attribution:** any mutation performed *while impersonating* is attributed
  to **both** the impersonated subject (as the apparent actor) **and** the real admin (as the
  responsible actor). The session payload already carries the impersonation pair
  (`realAdminId` + `impersonatedSubjectId`, see §"Session payload design"); the audit/write
  path stamps both IDs so accountability is never lost. Super Admin → Super Admin is blocked
  upstream (SEC-008).

---

## Consolidated Decision Register (D-style)

Single-glance summary of every load-bearing decision finalized in this design.

| # | Area | Decision |
|---|------|----------|
| **D1** | **Tenancy** | App-layer scoping. A `TenantContext` (derived from session active context) feeds a **base-repository tenant filter** that scopes every org-bound query by `trainerId`. Enforces SEC-007 (0% cross-org leakage) in the data layer, not ad-hoc per query. |
| **D2** | **Sessions** | Server-side. **Passport + express-session**, opaque httpOnly cookie, **Postgres session store**. **30-day sliding** absolute lifetime, **~14-day idle** cap, **1h hard impersonation** cap. Session payload carries (a) impersonation pair, (b) child-under-parent constrained principal, (c) active context (which profile + which trainer association). |
| **D3** | **Authz** | **Hybrid.** `@Roles()` decorator/guard for coarse role gates (BR-002, FR-002) **+** repo-level tenant filter (D1) for org isolation **+** **CASL** for fine-grained child sub-login constraints (FR-026, SEC-009: view/RSVP-with-approval yes; add-trainer/payment/purchase/delete no). |
| **D4** | **ShareLinks** | **Opaque random CSPRNG token** (≈256-bit, base64url), **not signed**, no embedded metadata. **DB row is the single source of truth** for type/expiry/uses/active. Static = unlimited/no-expiry (analytics-only count); unique = 1-use/7-day, atomic check-and-increment consumption. Revoke = flip `active`. Edge cases A–E resolved (§Q5b). |
| **D5** | **Approvals** | Dedicated **`ApprovalRequest`** entity + explicit state machine (`Pending → Approved\|Denied\|Expired\|Cancelled`, all terminal). **48h auto-deny** via scheduled guarded sweep. **USD always** requires approval; **TOKEN per-child** flag (`tokenSpendAllowed`, default OFF): ON ⇒ instant + auto-approved informational record. |
| **D6** | **Impersonation audit** | Bracketed `ImpersonationLog` (start/end/duration) + **dual-actor write attribution** (impersonated subject *and* real admin stamped on every mutation). 1h hard cap; SA→SA blocked. |
| **D7** | **Delete model** | **`status ∈ {Active, Inactive, Deleted}`** for reversible deactivate/reactivate **+** nullable **`anonymizedAt`** for irreversible GDPR scrub (`status=Deleted`). Reactivation guard rejects when `anonymizedAt != null`. FKs preserved (analytics intact). Field-level scrub per US-01.13; `UserDeletionLog` for legal compliance. |

---

## Refined Entity Model

Reflects all decisions above. Changes from the requirements draft are **bold**.

| Entity | Key Properties | Notes |
|--------|----------------|-------|
| **User** | email (unique), passwordHash, role, **status (Active\|Inactive\|Deleted)**, **anonymizedAt (nullable)**, emailVerified, lastLoginAt, timestamps | D7: status + anonymizedAt split. 1–1 Profile; 1–N associations. PII columns are the anonymization target. |
| Session (store-managed) | sid, **payload {impersonation pair, child-under-parent principal, active context}**, expiresAt | D2. Managed by `connect-pg-simple`-style adapter; payload shape owned by `SessionContextService`. |
| PasswordResetToken | token, userId, expiresAt (1h), usedAt | SEC-005. |
| EmailVerificationToken | token, userId, expiresAt (24h), usedAt | SEC-005, D-3 non-blocking. |
| TrainerProfile | businessName, orgDetails, **stripeIds\*, subscriptionStatus\*, platformFeePct\*** | \*Epic-05 owns logic; field ownership = open gap. |
| CoachProfile | bio, credentials, certifications, publicVisible, joinedTrainerAt, **status (Pending\|Active)** | belongs to exactly ONE Trainer (BR-006). |
| PlayerProfile | playerName, ageOrBirthDate, gender, **skillLevel (enum TBD)**, school, jerseyNumber, isChild, parentUserId?, emergencyContact | Anonymizable PII. skillLevel/age-group = open gaps. |
| **ChildLogin** | childProfileId, credentials, **permissionConstraints (CASL-evaluated)**, **tokenSpendAllowed (default false)** | D2/D3. Constrained sub-credential under parent (D-2). |
| TrainerPlayerAssociation | trainerId, playerProfileId, viaShareLinkId, connectedAt, **status (Active\|Removed)** | **Unique `(trainerId, playerProfileId)`** (BR-005 race-safe). Removal soft-deletes per-trainer child data. |
| ShareLink | **code (unique idx, opaque random)**, type (static\|unique), trainerId, createdBy, targetEmail?, expiresAt?, maxUses?, useCount, active | D4. Row authoritative. |
| Availability (BestTimes) | subjectType (coach\|player), subjectId, dayOfWeek, startTime, endTime, isAvailable, timestamps | Advisory (BR-015). |
| ImpersonationLog | adminId, impersonatedUserId, startAt, endAt, duration | D6 bracket; dual-actor attribution applied on writes elsewhere. |
| **ApprovalRequest** | id, childProfileId, parentUserId, eventId/orderRef, amount, paymentType (USD\|TOKEN), status (Pending\|Approved\|Denied\|Expired\|Cancelled), **autoApproved (bool)**, expiresAt (48h, null when autoApproved), resolvedAt, resolvedBy, parentNotes, timestamps | D5. Replaces `PurchaseApproval`. Indexes `(status,expiresAt)`, `(parentUserId,status)`, `(childProfileId,status)`. |
| CoachAvailabilityOverride | eventId, coachId, overriddenByTrainerId, reason (required), timestamp | BR-016. Coach-notify = open gap. |
| **UserDeletionLog** | originalUserId, originalEmail, deletedBy, reason, deletedAt, backupRef | D7. Written in scrub transaction. |
| PortalBranding | trainerId, logoUrl, primaryColorHex | FR-054. |

---

## Component / Module Breakdown

NestJS layered modules (Controller → Service → Repository), each registering its
tenant-aware repositories against the base-repo filter (D1).

| Module | Responsibility | Key services | Decisions |
|--------|----------------|--------------|-----------|
| `AuthModule` | Login/logout, Passport local strategy, express-session + Postgres store wiring, password reset, email verify, rate limiting | AuthService, `SessionContextService` | D2 |
| `AuthzModule` (cross-cutting) | `@Roles()` guard, `TenantContext` provider + base-repo filter, **CASL ability factory** for child constraints | RbacGuard, PolicyService (CASL) | D1, D3 |
| `UsersModule` | Super Admin directory, CRUD, status transitions, **GDPR anonymize** | UserService | D7 |
| `ImpersonationModule` | Start/exit, 1h cap enforcement, bracketed audit, dual-actor attribution | ImpersonationService | D6 |
| `ProfileModule` | Role-specific profiles, photo upload + thumbnail | ProfileService | FR-060/061 |
| `TrainersModule` | Trainer creation (SA-only), org-scoped queries, branding | TrainerService | D1, FR-053/054 |
| `CoachesModule` | Coach invite/accept, single-trainer enforcement, My Times, public profile | CoachService | BR-006, FR-040–044 |
| `PlayersModule` | ShareLink registration, multi-trainer association, child profiles, **context switching** | PlayerService | D2 (active context) |
| `ChildAccountModule` | Constrained sub-login auth, CASL constraint enforcement, ShareLink blocking + parent email | ChildAccountService | D3, FR-026/027 |
| `ShareLinksModule` | Generate static/unique, validate pipeline, atomic consumption, usage analytics | ShareLinkService | D4 |
| `ApprovalsModule` | USD/TOKEN approval flow, **48h scheduled sweep**, per-child token setting | ApprovalService + scheduler | D5 |
| `AvailabilityModule` | Best Times / My Times, conflict checks, override | AvailabilityService | BR-015/016 |
| `AuditModule` (cross-cutting) | Centralized audit writes (impersonation, deletion, override) | AuditService | SEC-006 |
| `EmailModule` (adapter) | Transactional email port | EmailService | Q-01.04 open |
| `StorageModule` (adapter) | Profile photos, logos, thumbnails | StorageService | FR-061 |
| `SchedulerModule` | Cron host for approval expiry sweep (and future timers) | — | D5 |

---

## Open Gaps (carried forward — do not block design, flag before dependent phases)

| ID | Gap | Blocks |
|----|-----|--------|
| **Q-01.01** | Skill-level definitions (Beginner…Elite or custom?) → `PlayerProfile.skillLevel` enum | Player profile model finalization |
| **Q-01.02** | Age-group definition (birth year / age range / grade) → child age model + availability filters | Child profile + planning filters |
| **Q-01.04** | Full list of automated emails (welcome, reset, verify, invites, approvals, child-blocked, …) | `EmailModule` finalization |
| **Q-01.06** | Should the coach be notified when their availability is overridden? | FR-043 notification path |
| **Epic-08** | Camp-to-User conversion field mapping — depends on camp/eval form schema for pre-fill | FR-032 |
| **Epic-05** | Payment field ownership — Trainer Stripe/subscription/platform-fee fields stored here but logic lives in Epic-05; confirm ownership boundary | TrainerProfile finalization |

(Token issuance/balance model and deleted-child-data reactivation semantics noted previously
remain cross-epic clarifications, not Epic-01 blockers.)

---

## Next Steps (suggested — not auto-executed)

- **Next by flow:** `/architect [TASK-001]` — validate the architecture implications of the
  decision register (app-layer tenancy + base-repo filter, hybrid authz with CASL, Postgres
  session store, scheduler for approval expiry) before plan-out.
- **Alternative:** `/writing-plans [TASK-001]` — generate the phased implementation plan
  (Phases A–G from the requirements doc) directly from this finalized design.
- **Alternative:** `/api-designer [TASK-001]` — formalize REST contracts/DTOs for the
  controllers in the module breakdown.

**Context handoff:** "TASK-001: Epic-01 auth/session/family-account design FINALIZED.
7 load-bearing decisions locked (D1 app-layer tenancy + base-repo filter, D2 server-side
Passport/express-session on Postgres with sliding/idle/impersonation caps, D3 hybrid
@Roles + tenant filter + CASL, D4 opaque ShareLink tokens with row-authoritative state,
D5 ApprovalRequest state machine with 48h auto-deny and per-child token setting, D6
bracketed dual-actor impersonation audit, D7 status+anonymizedAt delete model). Refined
entity model + 16-module breakdown documented. 6 open gaps carried (skill levels, age
groups, email list, coach-override notify, Epic-08 camp form, Epic-05 payment ownership)."

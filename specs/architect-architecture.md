# Architecture — System Design

> Living architecture specification. Updated incrementally per task.
> Read `MANIFEST.md` first for the project index.

---

## Architecture Style

**Layered NestJS** (Controller → Service → Repository) with feature modules under
`modules/` and cross-cutting infrastructure under `shared/`.

```
┌─────────────────────────────────────────────────────────┐
│ Presentation  — Controllers, DTOs, Guards, Interceptors  │
├─────────────────────────────────────────────────────────┤
│ Service       — Business logic, transaction boundaries   │
├─────────────────────────────────────────────────────────┤
│ Data Access   — Repositories (tenant-aware), Entities    │
└─────────────────────────────────────────────────────────┘
```

**Dependency rule:** Controller → Service → Repository, and any layer → `shared/`.
Never Repository → Service, never Service → Controller.

---

### [TASK-001] User Management & Authentication (2026-06-08)

**Source:** `tasks/TASK-001/requirements-analyst-requirements.md` +
`tasks/TASK-001/brainstorming-design.md` (decisions D1–D7) + architect refinements (A1–A2).

This is the **P0 foundation epic** — it establishes auth, session, multi-tenancy, RBAC,
and the family-account model that Epics 02–07 build on. Architectural patterns established
here (tenant isolation, hybrid authz, transaction strategy, scheduler) are **reused
platform-wide**, so they are documented as first-class architecture, not feature-local.

#### Module Placement

All feature logic lives in `modules/`; cross-cutting infra lives in `shared/`.

| Module | Path | Type | Responsibility |
|--------|------|------|----------------|
| AuthModule | `modules/auth/` | feature | Login/logout, Passport local strategy, session wiring, password reset, email verify, login rate limiting |
| UsersModule | `modules/users/` | feature | Super Admin directory, user CRUD, status transitions, GDPR anonymize |
| ImpersonationModule | `modules/impersonation/` | feature | Start/exit, 1h cap, bracketed audit + dual-actor attribution |
| ProfileModule | `modules/profile/` | feature | Role-specific profiles, photo upload + thumbnail |
| TrainersModule | `modules/trainers/` | feature | Trainer creation (SA-only), org-scoped queries, portal branding |
| CoachesModule | `modules/coaches/` | feature | Coach invite/accept, single-trainer enforcement, My Times, public profile |
| PlayersModule | `modules/players/` | feature | ShareLink registration, multi-trainer association, child profiles, context switching |
| ChildAccountModule | `modules/child-account/` | feature | Constrained sub-login auth, CASL constraint enforcement, ShareLink blocking + parent email |
| ShareLinksModule | `modules/sharelinks/` | feature | Generate static/unique, validation pipeline, atomic consumption, usage analytics |
| ApprovalsModule | `modules/approvals/` | feature | USD/TOKEN approval flow, 48h expiry sweep, per-child token setting |
| AvailabilityModule | `modules/availability/` | feature | Best Times / My Times, conflict checks, override |
| **AuthzModule** | `shared/authz/` | **cross-cutting** | `@Roles()` guard, CASL ability factory, `PolicyGuard`/`@CheckAbility` |
| **TenancyModule** | `shared/tenancy/` | **cross-cutting** | CLS-based `TenantContext`, `TenantAwareRepository` base, tenant interceptor |
| **AuditModule** | `shared/audit/` | **cross-cutting** | Centralized audit writes (impersonation, deletion, override) |
| EmailModule | `shared/integrations/email/` | adapter | Transactional email port (provider behind interface) |
| StorageModule | `shared/integrations/storage/` | adapter | Profile photos, logos, thumbnails |
| SchedulerModule | `shared/scheduler/` | cross-cutting | Cron host (approval expiry sweep + future timers) |

**Module dependency graph (no cycles):**

```
AuthModule ──────► TenancyModule (sets context post-login)
                   AuthzModule ──► TenancyModule (reads context for tenant filter)
feature modules ─► AuthzModule (guards) + TenancyModule (TenantAwareRepository)
                 ─► AuditModule (sensitive writes)
ApprovalsModule ─► SchedulerModule (registers expiry sweep)
Profile/Trainers ► StorageModule;  Auth/Coaches/Approvals ► EmailModule
```

Cross-cutting modules are imported via a shared `CoreModule`/global providers so feature
modules depend on stable infrastructure, never on each other for infra concerns.

---

#### A1 — Multi-Tenant Isolation Architecture (refines D1)

**Decision:** Tenant context propagates via **AsyncLocalStorage (`nestjs-cls`)**, not
request-scoped DI.

**Mechanism:**
1. A **`TenantInterceptor`** (or middleware) runs after session resolution, reads the
   **active context** from the session payload (active profile + active `trainerId`,
   plus impersonation/child principal), and populates a CLS store.
2. Services and repositories remain **default-scoped singletons** (no request-scope
   bubbling) and read the ambient `TenantContext` from CLS on demand.
3. A **`TenantAwareRepository`** base class automatically appends `WHERE trainerId = :ctx`
   to every query against an org-bound entity. The filter is **structural**, not per-call —
   developers cannot forget it (SEC-007: 0% cross-org leakage enforced in the data layer).

**Escape hatch:** Super Admin / impersonation paths use an explicit, **audited**
`withoutTenantScope()` (or system context) wrapper. Every escape is logged via AuditModule.

**Why CLS over request-scoped DI:** request-scoped providers force the entire injection
chain request-scoped (per-request instantiation), which degrades throughput at the
NFR-005 target (1000 concurrent). CLS keeps singletons hot while still giving ambient
per-request context. Industry-standard pattern for multi-tenant NestJS.

**Org-bound entities** (carry `trainerId`, auto-filtered): `TrainerPlayerAssociation`,
`ShareLink`, `CoachProfile`, `Availability`, `ApprovalRequest`, `PortalBranding`,
`CoachAvailabilityOverride`. **Global entities** (not tenant-filtered): `User`,
`PlayerProfile` (spans trainers via associations), `ImpersonationLog`, `UserDeletionLog`,
token tables, `Session`.

---

#### A2 — Authorization Architecture (refines D3, hybrid)

Three independent layers, each matched to what it enforces best:

| Layer | Mechanism | Enforces | Where |
|-------|-----------|----------|-------|
| **Role gate** | `@Roles()` decorator + `RolesGuard` | Coarse role check (BR-002, FR-002) | Controller handler |
| **Tenant isolation** | `TenantAwareRepository` filter (A1) | Org isolation (SEC-007) | Data layer (structural) |
| **Child constraints** | **CASL** ability factory + `@CheckAbility` guard | Fine-grained child sub-login rules (FR-026, SEC-009) | Controller/service |

- **CASL** is scoped narrowly to the child sub-login problem (view/RSVP-with-approval = allow;
  add-trainer / payment / purchase / delete = deny). It is a scalpel, not the app-wide
  policy engine — most endpoints use only `@Roles()` + the structural tenant filter.
- **SA → SA impersonation block** (SEC-008) enforced in ImpersonationService before session
  mutation.

---

#### Session Architecture (D2)

- **Server-side sessions** via **Passport (`@nestjs/passport`, local strategy) +
  `express-session`** backed by a **Postgres session store** (`connect-pg-simple`-style).
- **Cookie:** opaque session id, `httpOnly` + `Secure` + `SameSite`. **CSRF tokens** on all
  state-changing operations (SEC-002, SEC-003).
- **Timeouts (configurable; ship defaults):** 30-day sliding absolute lifetime, ~14-day idle
  cap, **1h hard impersonation cap**.
- **Session payload (owned by `SessionContextService`)** carries three concern groups:
  (a) impersonation pair (`realAdminId`, `impersonatedSubjectId`, `impersonationStartedAt`);
  (b) child-under-parent constrained principal; (c) active context (active profile + active
  `trainerId`). Group (c) is the source for the CLS `TenantContext` (A1).

---

#### Entity Relationships (key)

| Relationship | Type | Implementation |
|--------------|------|----------------|
| User ↔ Profile (Trainer/Coach/Player) | 1–1 | `@OneToOne` per role profile; role discriminates |
| Parent User → child PlayerProfiles | 1–N | `PlayerProfile.parentUserId` FK |
| PlayerProfile ↔ Trainer | N–N | junction `TrainerPlayerAssociation`, **unique `(trainerId, playerProfileId)`** (BR-005 race-safety) |
| Coach → Trainer | N–1 | `CoachProfile.trainerId`, exactly ONE active (BR-006) |
| ChildLogin → Parent User + PlayerProfile | N–1 / 1–1 | constrained sub-credential (D-2) |
| ApprovalRequest → child/parent/order | N–1 | indexes `(status,expiresAt)`, `(parentUserId,status)`, `(childProfileId,status)` |
| ShareLink → Trainer | N–1 | `code` **unique index** (opaque random, D4) |

Full entity table: see `tasks/TASK-001/brainstorming-design.md` §Refined Entity Model.

---

#### Transaction Boundaries

Multi-write operations that **must** be atomic (single service-method transaction):

| Operation | Writes in one transaction |
|-----------|---------------------------|
| GDPR anonymize (D7) | overwrite PII columns + set `anonymizedAt` + `status=Deleted` + insert `UserDeletionLog` |
| Unique ShareLink consume (D4, edge E) | conditional `UPDATE useCount` (atomic check-and-increment) **+** create `TrainerPlayerAssociation` / coach assoc; rollback releases the use |
| ShareLink registration (new player) | create `User` + `PlayerProfile` + `TrainerPlayerAssociation` |
| Approval resolution (D5) | status transition + (on approve) trigger payment/registration; guarded against already-terminal rows |
| Impersonation write (D6) | mutation + dual-actor audit stamp |

Single writes and reads use direct repository calls (implicit transaction).
Static ShareLink analytics increment is **best-effort/async** — never blocks the
registration hot path (NFR-004).

---

#### Scheduler Architecture (A2 refines D5)

- **In-process `@nestjs/schedule` cron** in `SchedulerModule`, guarded by a **Postgres
  advisory lock** so only one app instance performs work per tick under horizontal scaling
  (NFR-005). No Redis/queue infra added now ("Postgres now, Redis later").
- The expiry sweep itself is an **idempotent guarded conditional UPDATE**
  (`WHERE status='Pending' AND expiresAt < now()` → `Expired`), so even a double-fire is
  safe; the advisory lock is an efficiency guard, not a correctness dependency.

---

#### Security Considerations

- [x] **AuthN:** server-side sessions, hashed passwords (bcrypt/argon2, SEC-001), force
  password change for temp-password users (FR-006).
- [x] **AuthZ:** hybrid `@Roles()` + structural tenant filter + CASL child constraints (A2).
- [x] **Tenant isolation:** structural at data layer (A1, SEC-007).
- [x] **Input validation:** `class-validator` DTOs at controllers.
- [x] **Rate limiting:** on auth endpoints (SEC-004) — `@nestjs/throttler`.
- [x] **CSRF + cookie hardening:** SEC-002/003.
- [x] **Token expiry:** email verify 24h, password reset 1h, impersonation 1h (SEC-005).
- [x] **Audit logging:** impersonation (bracket + dual-actor), GDPR delete, availability
  override — centralized in AuditModule (SEC-006).
- [x] **GDPR:** in-place PII anonymization + `UserDeletionLog`, FKs preserved (D7).

#### Scalability Considerations

- [x] **Indexing:** `ShareLink.code` unique; `TrainerPlayerAssociation (trainerId,
  playerProfileId)` unique; `ApprovalRequest (status,expiresAt)` / `(parentUserId,status)` /
  `(childProfileId,status)`; `User.email` unique; session store indexed on sid + expiry;
  `trainerId` indexes on all org-bound tables (tenant filter hot path).
- [x] **Stateful sessions in Postgres:** acceptable at current scale; Redis is the
  documented escalation path if NFR-005 demands it.
- [x] **Singleton services + CLS:** no request-scope bubbling → high concurrency (A1).
- [x] **Async processing:** static-link analytics increment, transactional emails, and the
  approval expiry sweep run off the request hot path.
- [x] **Horizontal scaling:** stateless app instances (session/context external in
  Postgres/CLS); scheduler safe via advisory lock (A2).

#### Open Gaps (architectural impact noted; do not block foundation phases)

| ID | Gap | Architectural impact |
|----|-----|----------------------|
| Q-01.01 | Skill-level definitions | `PlayerProfile.skillLevel` enum shape |
| Q-01.02 | Age-group definition | child age model + availability filters |
| Q-01.04 | Automated email list | `EmailModule` port surface |
| Q-01.06 | Coach override notification | FR-043 notification path |
| Epic-08 | Camp-to-User field mapping | FR-032 conversion DTO |
| Epic-05 | Payment field ownership | `TrainerProfile` Stripe/subscription/fee field ownership boundary |

# PracticePerfect — Architecture Overview for Contributors

> **Quick Reference:** This document provides a high-level architecture summary, module map, design patterns, and PR history for Epic-01. For detailed specifications, see the living specs in `specs/`.

---

## Quick Links

| Document | Purpose |
|----------|---------|
| **`README.md`** (root) | Run guide: backend/frontend setup, testing, env vars |
| **`specs/MANIFEST.md`** | Project index, tech stack, key decisions (D1–D7) |
| **`specs/architect-architecture.md`** | System design, multi-tenancy (A1), auth (A2), modules, transaction boundaries |
| **`specs/api-designer-spec.md`** | Full API contracts, DTOs, error shapes, session model |
| **`specs/frontend-design-spec.md`** | Pages, components, routing, state management, design tokens |
| **`Task/designs/DESIGN_TOKENS.md`** | PracticePerfect design tokens (Tailwind CSS vars) |

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Frontend (Vite + React)                    │
│  - Pages: Login, Join (registration), Profile, Users (admin)   │
│  - Features: Context switcher, impersonation banner, sharelinks│
│  - State: TanStack Query, React Context, React Router v7       │
│  - Design: Editorial Athletic (light/dark), brand tokens       │
│  - Port: http://localhost:5173 (dev proxy /api → :3000)       │
└────────────────────────────────────────────────────────────────┘
                             ↓ HTTP + Cookie + CSRF
┌────────────────────────────────────────────────────────────────┐
│                  Backend (NestJS + Nx Monorepo)                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Controllers (HTTP handlers, @Roles, input validation)  │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  Services (business logic, transactions, workflows)      │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  Repositories (data access, TenantAwareRepository filter)│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Shared / Cross-cutting ─────────────────────────────────┐  │
│  │  - TenancyModule: CLS context, AsyncLocalStorage        │  │
│  │  - AuthzModule: RolesGuard, CASL ability factory        │  │
│  │  - AuditModule: centralized audit writes                │  │
│  │  - SchedulerModule: Postgres advisory lock + cron        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Port: http://localhost:3000/api/v1                           │
└────────────────────────────────────────────────────────────────┘
                             ↓ SQL + Session Store
┌────────────────────────────────────────────────────────────────┐
│                   PostgreSQL 16 (TypeORM)                       │
│  - Org-bound tables: ShareLink, Availability, ApprovalRequest  │
│  - Global tables: User, Session, UserDeletionLog, ImpersonLog  │
│  - Session store: connect-pg-simple (opaque cookie issued)     │
│  - Port: 5432 (dev), 5433 (test)                              │
└────────────────────────────────────────────────────────────────┘
```

---

## Module Map (Backend)

### Feature Modules

| Module | Path | Responsibility |
|--------|------|-----------------|
| **auth** | `modules/auth/` | Login/logout, Passport local strategy, password reset, email verify, rate limiting |
| **users** | `modules/users/` | SA directory, user CRUD, status transitions, GDPR anonymization |
| **trainers** | `modules/trainers/` | Trainer creation (SA), org-scoped view, portal branding |
| **coaches** | `modules/coaches/` | Coach invite/accept, single-trainer guard, My Times availability |
| **players** | `modules/players/` | ShareLink registration, multi-trainer assoc, child profiles, context switch |
| **child-account** | `modules/child-account/` | Sub-login auth, CASL constraints (view/RSVP allowed, add-trainer/payment denied) |
| **sharelinks** | `modules/sharelinks/` | Generate static/unique links, validation, atomic consume |
| **approvals** | `modules/approvals/` | Child purchase approval flow, 48h expiry sweep, token setting |
| **availability** | `modules/availability/` | Best Times (player), My Times (coach), conflict check, override (logged) |
| **impersonation** | `modules/impersonation/` | SA impersonate, 1h cap, start/exit/history, bracket audit |

### Cross-Cutting Modules

| Module | Path | Responsibility |
|--------|------|-----------------|
| **authz** | `shared/authz/` | `@Roles()` guard, CASL ability factory, `PolicyGuard` |
| **tenancy** | `shared/tenancy/` | CLS context, `TenantAwareRepository` base, tenant interceptor |
| **audit** | `shared/audit/` | Centralized audit writes (impersonation, delete, override) |
| **scheduler** | `shared/scheduler/` | In-process cron host + Postgres advisory lock |
| **email** | `shared/integrations/email/` | Transactional email (port/adapter pattern) |
| **storage** | `shared/integrations/storage/` | Profile photos, logos, thumbnails |

**Dependency graph (no cycles):**
```
auth ────────► tenancy ◄──── authz ◄──── feature modules
                               ↓
                         TenantAwareRepository
feature modules ────────► audit, authz, tenancy
approvals ─────────────► scheduler (registers expiry sweep)
profile/trainers ──────► storage
auth/coaches/approvals ► email
```

---

## Multi-Tenancy Pattern (A1)

### Why AsyncLocalStorage (CLS) Instead of Request-Scoped DI?

Request-scoped DI forces the entire injection chain request-scoped per-request instantiation, which degrades throughput at scale (NFR-005: 1000 concurrent targets). **CLS keeps singletons hot** while still giving per-request ambient context — the **industry-standard pattern for multi-tenant NestJS**.

### Mechanism

1. **Context propagation:** After session resolution, a **`TenantInterceptor`** reads the active context from the session payload (active profile + active `trainerId`, plus impersonation/child principal) and populates a CLS store.

2. **Structural filtering:** A **`TenantAwareRepository`** base class (extends TypeORM Repository) automatically appends `WHERE trainerId = :ctx` to every query against an org-bound entity. The filter is **structural, not per-call** — developers **cannot forget it** (SEC-007: 0% cross-org leakage enforced in the data layer).

3. **Org-bound entities** (carry `trainerId`, auto-filtered):
   - ShareLink
   - TrainerPlayerAssociation
   - CoachProfile
   - Availability, CoachAvailabilityOverride
   - ApprovalRequest
   - PortalBranding

4. **Global entities** (not tenant-filtered):
   - User, TrainerProfile, PlayerProfile
   - Session
   - UserDeletionLog, ImpersonationLog
   - Token tables

5. **Escape hatch:** Super Admin / impersonation paths use explicit `withoutTenantScope()`. **Every escape is logged** via AuditModule (SEC-006).

---

## Authentication & Authorization (A2 — Hybrid)

### Authentication: Server-Side Sessions

- **Mechanism:** Passport `LocalStrategy` + `express-session` with **Postgres session store** (`connect-pg-simple`).
- **Cookie:** Opaque session ID, `httpOnly` + `Secure` + `SameSite=Lax`. **CSRF tokens** on all state-changing operations.
- **No JWT:** Stateless tokens unsuitable for revocation, impersonation, child sub-login constraints.
- **Timeouts:**
  - 30-day sliding absolute lifetime
  - ~14-day idle timeout
  - **1h hard impersonation cap**
- **Password hashing:** Argon2 (modern, memory-hard, resistant to GPU attacks).
- **Force change:** Temp-password users must reset on first login (FR-006).

### Authorization: Three Independent Layers

| Layer | Mechanism | Enforces | Where |
|-------|-----------|----------|-------|
| **Role gate** | `@Roles()` decorator + `RolesGuard` | Coarse role check (SUPER_ADMIN, TRAINER, COACH, PLAYER) | Controller handler |
| **Tenant isolation** | `TenantAwareRepository` filter (A1) | Org isolation (SEC-007) | Data layer (structural) |
| **Child constraints** | **CASL** ability factory + `@CheckAbility` guard | Fine-grained child sub-login rules (view/RSVP allowed, add-trainer/payment denied, SEC-009) | Controller/service |

**Note:** CASL is scoped narrowly to the child sub-login problem. Most endpoints use only `@Roles()` + the structural tenant filter.

**SA → SA impersonation block** (SEC-008): Enforced in `ImpersonationService` before session mutation.

### Session Payload

The session carries three concern groups:
1. **Impersonation pair:** `realAdminId`, `impersonatedSubjectId`, `impersonationStartedAt`
2. **Child sub-login:** Constrained principal tied to parent User + child PlayerProfile
3. **Active context:** Active profile + active `trainerId` (source for CLS `TenantContext`)

---

## Key Design Decisions (D1–D7)

| ID | Decision | Impact |
|----|----------|--------|
| **D1** | Multi-tenant isolation via AsyncLocalStorage (CLS), not request-scoped DI | Preserves throughput at scale; structural filtering prevents cross-org leakage |
| **D2** | Server-side sessions (Passport + express-session), not JWT | Enables revocation, impersonation, child constraints; no stateless token limitations |
| **D3** | Hybrid authz: `@Roles()` + tenant filter + CASL | Layered defense: coarse role gate, structural org isolation, fine-grained child rules |
| **D4** | ShareLinks: opaque CSPRNG token, type/expiry/uses in DB | Static (unlimited) for player reg; unique (1-use, 7-day) for coach invite; atomic consume |
| **D5** | Approvals: state machine + 48h auto-expiry via Postgres advisory lock + in-process cron | Idempotent, scalable, no extra infra (Redis); double-fire is safe |
| **D6** | Impersonation: bracketed audit (start + end) + dual-actor attribution | Compliance: who impersonated whom, when, for how long; real admin + subject both logged |
| **D7** | Delete model: `status {Active, Inactive, Deleted}` + `anonymizedAt` (irreversible GDPR scrub) | Reversible soft-delete (reactivate); irreversible PII anonymization; FKs preserved; compliance log |

---

## Transaction Boundaries

Multi-write operations that **must** be atomic (single service-method transaction):

| Operation | Writes | Atomicity |
|-----------|--------|-----------|
| **GDPR anonymize** | Overwrite PII + set `anonymizedAt` + `status=Deleted` + insert `UserDeletionLog` | Single txn |
| **Unique ShareLink consume** | Conditional `UPDATE useCount` + create `TrainerPlayerAssociation` / coach assoc | Single txn (rollback releases use) |
| **ShareLink registration (new player)** | Create `User` + `PlayerProfile` + `TrainerPlayerAssociation` | Single txn |
| **Approval resolution** | Status transition + (on approve) trigger payment/registration | Single txn (guarded against terminal rows) |
| **Impersonation write** | Session mutation + dual-actor audit stamp | Single txn |

Single writes/reads use **implicit transactions** (direct repository calls). Static ShareLink analytics increment is **best-effort/async** (never blocks hot path, NFR-004).

---

## Scheduler Architecture

**Strategy:** In-process `@nestjs/schedule` cron, guarded by **Postgres advisory lock** so only one app instance performs work per tick under horizontal scaling (NFR-005). No Redis/queue infra required.

**Approvals expiry sweep:**
- Runs every X minutes (configurable).
- Lock: `SELECT pg_advisory_lock(12345)` — first instance wins.
- Query: `UPDATE approvals SET status='Expired' WHERE status='Pending' AND expiresAt < NOW()`
- Idempotency: Double-fire is safe; the UPDATE is guarded conditional.

---

## Entity Relationships (Core)

| Relationship | Type | Implementation | Notes |
|--------------|------|----------------|-------|
| User ↔ Profile | 1–1 | `@OneToOne` per role; role discriminates | TrainerProfile, CoachProfile, PlayerProfile |
| Parent User → Child PlayerProfiles | 1–N | `PlayerProfile.parentUserId` FK | Child is a profile, not an account |
| PlayerProfile ↔ Trainer | N–N | Junction `TrainerPlayerAssociation` | Unique `(trainerId, playerProfileId)` (BR-005) |
| Coach → Trainer | N–1 | `CoachProfile.trainerId`, exactly ONE active | Single-trainer constraint (BR-006) |
| ChildLogin → Parent User + PlayerProfile | N–1 / 1–1 | Constrained sub-credential | Child login tied to parent, not standalone |
| ApprovalRequest → child/parent/order | N–1 | Indexes `(status, expiresAt)`, `(parentUserId, status)`, `(childProfileId, status)` | State machine: Pending → Approved/Denied/Expired/Cancelled |
| ShareLink → Trainer | N–1 | `code` unique index | Opaque random, unsigned (D4) |

Full entity schema: see `specs/architect-architecture.md` and migration files in `backend/apps/api/src/shared/database/migrations/`.

---

## API Conventions (from `specs/api-designer-spec.md`)

- **Base URL:** `/api/v1`
- **Resource IDs:** UUID v4 (`ParseUUIDPipe`, anti-enumeration)
- **Single resource:** Bare response body (e.g., `{ id, email, role, ... }`)
- **List response:** `{ data: [...], meta: { page, limit, total } }` (page-based envelope)
- **Errors:** Nest-style shape:
  ```json
  {
    "statusCode": 400,
    "message": "Validation failed",
    "error": "Bad Request",
    "errorCode": "VALIDATION_ERROR",
    "details": [{ "field": "email", "message": "..." }]
  }
  ```
- **Auth:** `@ApiCookieAuth('session')` + `X-CSRF-Token` header on POST/PUT/PATCH/DELETE (no bearer tokens)
- **Session cookie:** opaque `httpOnly` session ID (Postgres store authoritative)

---

## Phase-by-Phase PR History

| Phase | PRs | Timeline | What Shipped |
|-------|-----|----------|--------------|
| **A: Foundation** | — | Parallel to task (TDD, bite-sized) | Scaffold, tenancy, auth, authz, session store, health check |
| **B: User Management** | PR #2 | After A | SA CRUD, profiles, GDPR delete, photo upload, password reset |
| **C: ShareLinks** | PR #3 | After B | Static/unique links, player reg, coach invite, validation, atomic consume |
| **D: Family & Approvals** | PR #6 | After C | Child profiles, context switch, child auth, approval flow, 48h expiry |
| **E: Availability** | PR #7 | After D | Best Times, My Times, conflict check, override (logged) |
| **F: Impersonation & Audit** | PR #8 | After E | SA impersonate, 1h cap, bracket audit, dual-actor attribution, history |
| **G: Branding & Polish** | PR #9 | After F | Portal branding (logo + color), perf hardening, security sweep |
| **Frontend Integration** | PR #5 | Parallel to D/E/F | Auth UI, profile, context switcher, impersonation banner, sharelinks sheet |
| **Entity Type Fix** | PR #4 | Between C & D | Explicit VARCHAR on nullable columns for app boot |

**Critical fix:** PR #4 (entity type fix, M-3/M-4) was required for production app boot; applied retroactively.

---

## Test Coverage Summary

### Backend (330+ tests, 50+ suites)

- **Auth:** login, logout, rate limiting, password reset, email verify
- **Users:** CRUD, deactivate, reactivate, GDPR anonymize, status transitions
- **ShareLinks:** generate, validate, consume (atomic race condition), list, revoke, usage analytics
- **Players:** registration, multi-trainer association, no-duplicate (BR-005), child context
- **Child Auth:** sub-login, CASL constraints, approval workflow
- **Coaches:** invite, accept, single-trainer guard (BR-006), coach list isolation
- **Availability:** Best Times, My Times, conflict detection, override (logged)
- **Impersonation:** start, exit, history, SA→SA block, 1h cap, dual-actor audit
- **Branding:** logo upload, color picker, WCAG contrast guard, live preview
- **Multi-tenancy:** cross-tenant isolation verification

Conventions:
- **Unit tests:** business logic, edge cases
- **Integration tests:** service interactions, transactions
- **E2E tests:** full request cycle, auth, multi-tenancy

### Frontend (120+ tests)

- **Auth:** login form, logout, session state management
- **Pages:** login, join (registration), profile, users (admin)
- **Context:** switcher (parent/children), data isolation
- **Impersonation:** banner display, countdown, auto-exit
- **ShareLinks:** generate, copy, revoke
- **A11y:** smoke tests, WCAG contrast verification

---

## Development Workflow Checklist

### Adding a Feature

1. **Create module** under `backend/apps/api/src/modules/[feature]/`:
   - `[feature].module.ts` — module definition
   - `[feature].controller.ts` — HTTP handlers
   - `[feature].service.ts` — business logic
   - `[feature].repository.ts` — data access (extend `TenantAwareRepository` if org-bound)
   - `entities/` — TypeORM entities
   - `dto/` — validation & response DTOs
   - `__tests__/` — unit + e2e tests

2. **Extend TenantAwareRepository** if the entity is org-bound (carries `trainerId`).

3. **Write tests first** (TDD). Test db is `NODE_ENV=test` on port 5433.

4. **Import into `app.module.ts`** and respect the dependency graph (see module map).

5. **Commit:** One feature per commit; include test count in message (e.g., `feat(coaches/C11): coach invite + acceptance (n tests passing)`).

### Database Changes

1. **Create a migration** in `backend/apps/api/src/shared/database/migrations/`:
   ```typescript
   export class MigrationNameXXXXXXXXXXXX {
     async up(queryRunner) { /* SQL */ }
     async down(queryRunner) { /* SQL */ }
   }
   ```

2. **Export** from `run-migrations.mjs` and test:
   ```bash
   DATABASE_URL=... node apps/api/src/shared/database/run-migrations.mjs
   ```

3. **Verify idempotency** — re-running must be safe.

### Security Checklist

Before committing:

- [ ] **Auth:** Only SA can create trainers, child constraints enforced?
- [ ] **Multi-tenancy:** Queries filtered by `trainerId`? Using `TenantAwareRepository` or `withoutTenantScope()`?
- [ ] **CSRF:** POST/PUT/PATCH/DELETE requires `X-CSRF-Token` header?
- [ ] **Audit:** Sensitive writes (delete, override, impersonation) logged?
- [ ] **Rate limiting:** Auth endpoints (login, password reset) throttled?
- [ ] **Validation:** DTOs use `class-validator` decorators?
- [ ] **Test coverage:** Unit + e2e tests for happy path + errors?

---

## Environment & Dependencies

### Backend

- **Node.js:** 18+
- **Postgres:** 16 (dev on :5432, test on :5433)
- **NestJS:** 11.x
- **TypeORM:** 1.x
- **Passport:** 0.7.x
- **express-session:** 1.19.x
- **nestjs-cls:** 6.2.x
- **CASL:** 7.x
- **Argon2:** 0.44.x

### Frontend

- **Node.js:** 18+
- **React:** 19.x
- **Vite:** 6.x
- **TanStack React Query:** 5.x
- **React Router:** 7.x
- **Tailwind CSS:** 4.x
- **Framer Motion:** 12.x

---

## Next Steps for Contributors

1. **Run the app locally:** Follow `README.md` (backend + frontend + seeding).
2. **Read the specs:** `specs/architect-architecture.md` → `api-designer-spec.md` → `frontend-design-spec.md`.
3. **Explore modules:** Pick a feature (auth, players, approvals) and trace the flow: Controller → Service → Repository.
4. **Write a test:** Add a unit test for a service or a new endpoint; commit.
5. **For new features (Epic-02+):** Use the module template above. Respect the dependency graph. Test first.

---

## Troubleshooting

**Postgres connection error:** Ensure `docker compose up -d postgres` (or `postgres_test` for tests).

**Migration failure:** Check `DATABASE_URL` and Postgres running. Inspect error for FK/unique constraint violations.

**Session store locked:** The `sessions` table is auto-created by `connect-pg-simple`. If migrations fail, drop and re-migrate.

**Cross-tenant data leaking:** Check that the repository extends `TenantAwareRepository` or manually filters by `trainerId`. Verify test coverage for multi-tenancy.

---

**Last Updated:** 2026-06-09  
**Epic:** Epic-01 (User Management & Authentication)  
**Status:** Complete (Phases A–G, frontend integrated, 330+ tests passing)

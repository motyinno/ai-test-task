# User Management & Authentication — Implementation Plan

**Task:** TASK-001

> **For Claude:** Use `using-git-worktrees` to create an isolated workspace, then implement
> with the `coder` skill. This plan is **backend-first**; the frontend is a referenced
> follow-on (see "Frontend Follow-On"). Phase A is fully bite-sized (TDD); Phases B–G are a
> structured task index — expand each phase with `/writing-plans [TASK-001] <phase>` when you
> reach it.

**Goal:** Build the P0 foundation epic — multi-role auth, server-side sessions, multi-tenant
isolation, hybrid RBAC, and the family-account model — that unblocks Epics 02–07.

**Architecture:** Layered NestJS (Controller → Service → Repository) in an Nx monorepo.
Multi-tenancy via `nestjs-cls` AsyncLocalStorage + a `TenantAwareRepository` base that
structurally filters every org-bound query by `trainerId` (D1/A1). Server-side sessions
(Passport local + `express-session` on a Postgres store, D2). Hybrid authz: `@Roles()` guard +
structural tenant filter + CASL for child sub-login constraints (D3/A2).

**Tech Stack:** Nx · NestJS · TypeScript · PostgreSQL · TypeORM · `nestjs-cls` ·
`express-session` + `connect-pg-simple` · Passport (local) · `argon2` · `@nestjs/throttler` ·
`@casl/ability` · `@nestjs/schedule` · Jest (unit + e2e).

**Source specs:** `tasks/TASK-001/requirements-analyst-requirements.md`,
`tasks/TASK-001/brainstorming-design.md` (D1–D7), `specs/architect-architecture.md` (A1–A2),
`specs/api-designer-spec.md`, `specs/frontend-design-spec.md`.

**Conventions (from specs — do not deviate):** UUID v4 PKs (`@PrimaryGeneratedColumn('uuid')`,
`ParseUUIDPipe`); list responses `{ data, meta }`, single resources bare; Nest error shape;
session cookie auth + `X-CSRF-Token` (no JWT/bearer); passwords `argon2`; `class-validator`
DTOs; commit after every green test.

---

## Phase Map

| Phase | Scope | Plan detail |
|-------|-------|-------------|
| **A** | Scaffold + Tenancy + Auth + Authz (the reused foundation) | **Full bite-sized TDD (below)** |
| B | User management core (SA directory, CRUD, delete model D7, profiles) | Index |
| C | ShareLink & invitations (D4) + registration + coach invite | Index |
| D | Player/Parent family (children, context switching, child sub-login, approvals D5) | Index |
| E | Availability (Best Times / My Times, conflict/override) | Index |
| F | Super Admin tooling (impersonation + audit D6) | Index |
| G | Branding + accessibility + perf hardening | Index |

---

# PHASE A — Foundation (bite-sized TDD)

> Everything else imports this. Build and verify it first. Each task ends with a commit.

### Task A1: Scaffold Nx monorepo + NestJS backend

**Files:**
- Create: repo root `package.json`, `nx.json`, `apps/backend/` (Nx NestJS app)

**Step 1: Init workspace**
Run:
```bash
npx create-nx-workspace@latest . --preset=nest --appName=backend --nxCloud=skip --packageManager=npm
```
Expected: `apps/backend/` with `main.ts`, `app.module.ts`; `npx nx serve backend` boots.

**Step 2: Install foundation deps**
```bash
npm i @nestjs/typeorm typeorm pg nestjs-cls express-session connect-pg-simple \
  passport passport-local @nestjs/passport argon2 @nestjs/throttler @casl/ability \
  @nestjs/schedule @nestjs/config class-validator class-transformer @nestjs/swagger
npm i -D @types/express-session @types/passport-local supertest
```

**Step 3: Verify boot**
Run: `npx nx serve backend`
Expected: server listens on `:3000`, no errors. Stop it.

**Step 4: Commit**
```bash
git add -A && git commit -m "chore(backend): scaffold nx + nestjs workspace with foundation deps"
```

---

### Task A2: Config + Postgres/TypeORM connection

**Files:**
- Create: `apps/backend/src/shared/config/config.module.ts`, `database/database.module.ts`
- Modify: `apps/backend/src/app/app.module.ts`
- Test: `apps/backend/src/shared/database/__tests__/database.module.spec.ts`

**Step 1: Write the failing test**
```typescript
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatabaseModule } from '../database.module';
describe('DatabaseModule', () => {
  it('provides a connected DataSource', async () => {
    const mod = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    const ds = mod.get(DataSource);
    expect(ds.isInitialized).toBe(true);
    await mod.close();
  });
});
```

**Step 2: Run test to verify it fails**
Run: `npx nx test backend --testPathPattern=database.module.spec`
Expected: FAIL (module not found).

**Step 3: Write minimal implementation**
`ConfigModule` loads `.env` (`DATABASE_URL`, `SESSION_SECRET`, etc.). `DatabaseModule` wires
`TypeOrmModule.forRootAsync` (Postgres, `autoLoadEntities: true`, `synchronize: false`,
migrations dir). Provide a `.env.test` pointing at a disposable Postgres (docker or CI service).

**Step 4: Run test to verify it passes**
Run: `npx nx test backend --testPathPattern=database.module.spec`
Expected: PASS.

**Step 5: Commit**
```bash
git add -A && git commit -m "feat(backend): add config + typeorm postgres connection"
```

---

### Task A3: Global validation pipe, error filter, health check

**Files:**
- Create: `shared/errors/http-exception.filter.ts`, `shared/health/health.controller.ts`
- Modify: `apps/backend/src/main.ts` (global `ValidationPipe({ whitelist:true, transform:true })`,
  global filter), `app.module.ts`
- Test: `shared/health/__tests__/health.e2e-spec.ts`

**Step 1: Write the failing test** — e2e `GET /api/v1/health` → 200 `{ status: 'ok' }`.
**Step 2:** Run → FAIL.
**Step 3:** Implement health controller; set global prefix `api/v1`; filter formats the
Nest error shape (`statusCode/message/error/errorCode/details`).
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(backend): global validation, error filter, health check"`

---

### Task A4: CLS tenant context (nestjs-cls)

**Files:**
- Create: `shared/tenancy/tenant-context.ts` (typed CLS keys + `TenantContextService`)
- Modify: `app.module.ts` (`ClsModule.forRoot({ middleware: { mount: true } })`)
- Test: `shared/tenancy/__tests__/tenant-context.spec.ts`

**Step 1: Write the failing test**
```typescript
it('stores and reads active trainerId within a CLS run', async () => {
  await cls.run(async () => {
    svc.set({ userId: 'u1', role: 'TRAINER', trainerId: 't1' });
    expect(svc.get().trainerId).toBe('t1');
  });
});
```
**Step 2:** Run → FAIL.
**Step 3:** Implement `TenantContextService` over `ClsService` with a typed shape
`{ userId, role, trainerId?, isChild, parentUserId?, impersonatorId?, systemContext? }`.
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(tenancy): cls-based tenant context service"`

---

### Task A5: `TenantAwareRepository` base class

**Files:**
- Create: `shared/tenancy/tenant-aware.repository.ts`
- Test: `shared/tenancy/__tests__/tenant-aware.repository.spec.ts`

**Step 1: Write the failing test** — given context `trainerId='t1'`, `find()` appends
`where trainerId='t1'`; `withoutTenantScope(fn)` runs `fn` unscoped; calling scoped find with
no context throws `TenantContextMissingError`.
**Step 2:** Run → FAIL.
**Step 3:** Implement a generic base extending TypeORM `Repository<T>` that injects the
`TenantContextService`, auto-merges `{ trainerId }` into query `where` for entities flagged
org-bound, and exposes `withoutTenantScope()` (sets `systemContext`) that **must** be audited
by callers. Document the org-bound vs global entity list (A1).
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(tenancy): tenant-aware base repository with audited escape hatch"`

---

### Task A6: `User` entity + first migration

**Files:**
- Create: `modules/users/entities/user.entity.ts`, migration
- Test: `modules/users/entities/__tests__/user.entity.spec.ts`

**Step 1: Write the failing test** — entity has `id (uuid)`, `email (unique)`, `passwordHash`,
`role (enum UserRole)`, `status (enum, default ACTIVE)`, `anonymizedAt (nullable)`,
`emailVerified (default false)`, `mustChangePassword (default false)`, `lastLoginAt?`,
timestamps. Repo can save + enforce unique email.
**Step 2:** Run → FAIL.
**Step 3:** Implement entity; generate migration `npx nx run backend:migration:generate
--name CreateUser`; run `migration:run`.
**Step 4:** Run → PASS (unique email throws on duplicate).
**Step 5:** `git commit -m "feat(users): user entity + migration (status + anonymizedAt, D7)"`

---

### Task A7: Password hashing util (argon2)

**Files:**
- Create: `shared/crypto/password.service.ts`
- Test: `shared/crypto/__tests__/password.service.spec.ts`

**Step 1: Write the failing test** — `hash(pw)` returns a verifiable argon2 string;
`verify(hash, pw)` true for correct, false for wrong.
**Step 2:** Run → FAIL.
**Step 3:** Implement `PasswordService` wrapping `argon2.hash/verify` (SEC-001).
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(crypto): argon2 password service"`

---

### Task A8: Session store + cookie hardening

**Files:**
- Create: `shared/session/session.setup.ts`, session table migration
- Modify: `main.ts` (mount `express-session` before passport)
- Test: `shared/session/__tests__/session.e2e-spec.ts`

**Step 1: Write the failing test** — hitting a route that sets `req.session.foo` returns a
`Set-Cookie` with `HttpOnly`, `SameSite`, and (in prod) `Secure`; a second request with the
cookie reads `foo` back.
**Step 2:** Run → FAIL.
**Step 3:** Configure `express-session` with `connect-pg-simple` (Postgres store), `secret`
from config, `cookie: { httpOnly, sameSite:'lax', secure: isProd, maxAge: 30d }`, `rolling:true`
(30-day sliding, D2). Create the session table migration.
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(session): express-session on postgres store with hardened cookie"`

---

### Task A9: Passport local strategy + `SessionContextService`

**Files:**
- Create: `modules/auth/strategies/local.strategy.ts`,
  `modules/auth/session-context.service.ts`
- Test: `modules/auth/__tests__/local.strategy.spec.ts`

**Step 1: Write the failing test** — strategy validates email+password via `PasswordService`,
returns the principal for valid creds, throws `UnauthorizedException` otherwise; rejects
`INACTIVE`/`DELETED` users with `ACCOUNT_DEACTIVATED`.
**Step 2:** Run → FAIL.
**Step 3:** Implement local strategy. `SessionContextService` reads/writes the session payload
segments (a) impersonation pair, (b) child-under-parent principal, (c) active context (D2).
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(auth): passport local strategy + session context service"`

---

### Task A10: `TenantInterceptor` — hydrate CLS from session

**Files:**
- Create: `shared/tenancy/tenant.interceptor.ts`
- Modify: `app.module.ts` (register as `APP_INTERCEPTOR`)
- Test: `shared/tenancy/__tests__/tenant.interceptor.spec.ts`

**Step 1: Write the failing test** — given a request whose session has active context
`{ userId, role, trainerId }`, after the interceptor the `TenantContextService` returns that
context inside the handler; anonymous request → empty context.
**Step 2:** Run → FAIL.
**Step 3:** Implement interceptor that reads `SessionContextService` and calls
`TenantContextService.set(...)` inside the CLS run for the request. Order: session → passport →
interceptor.
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(tenancy): interceptor hydrates cls context from session"`

---

### Task A11: AuthService + AuthController (login/logout/me)

**Files:**
- Create: `modules/auth/auth.service.ts`, `auth.controller.ts`, `auth.module.ts`,
  `dto/login.dto.ts`, `dto/me-response.dto.ts`
- Test: `modules/auth/__tests__/auth.e2e-spec.ts`

**Step 1: Write the failing test** — `POST /api/v1/auth/login` valid → 200 `MeResponseDto` +
Set-Cookie; invalid → 401; `GET /auth/me` with cookie → principal + activeContext;
`POST /auth/logout` destroys session (subsequent `/me` → 401).
**Step 2:** Run → FAIL.
**Step 3:** Implement controller delegating to `AuthService` (uses local guard); `me` maps the
session principal + active context to `MeResponseDto`; logout calls `session.destroy`.
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(auth): login, logout, me endpoints"`

---

### Task A12: CSRF protection on state-changing routes

**Files:**
- Create: `shared/security/csrf.middleware.ts` (+ `GET /auth/csrf` to mint a token)
- Modify: `main.ts`
- Test: `shared/security/__tests__/csrf.e2e-spec.ts`

**Step 1: Write the failing test** — a `POST` without `X-CSRF-Token` → 403 `CSRF_INVALID`;
with a token fetched from `GET /auth/csrf` → passes.
**Step 2:** Run → FAIL.
**Step 3:** Implement double-submit CSRF (token in session + `X-CSRF-Token` header) on unsafe
methods (SEC-003). Exempt login (pre-session) per chosen pattern.
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(security): csrf protection on state-changing requests"`

---

### Task A13: Rate limiting on auth endpoints

**Files:**
- Modify: `app.module.ts` (`ThrottlerModule`), `auth.controller.ts` (`@Throttle`)
- Test: `modules/auth/__tests__/auth-throttle.e2e-spec.ts`

**Step 1: Write the failing test** — N+1 rapid `POST /auth/login` failures → 429.
**Step 2:** Run → FAIL.
**Step 3:** Configure `@nestjs/throttler`; tighter limit on `login` + `password-reset` (SEC-004).
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(auth): rate limit login + password reset"`

---

### Task A14: `@Roles()` decorator + `RolesGuard`

**Files:**
- Create: `shared/authz/roles.decorator.ts`, `roles.guard.ts`
- Modify: `app.module.ts` (`APP_GUARD`)
- Test: `shared/authz/__tests__/roles.guard.spec.ts`

**Step 1: Write the failing test** — handler marked `@Roles('SUPER_ADMIN')`: SA principal →
allowed; TRAINER principal → `ForbiddenException`; unauthenticated → 401.
**Step 2:** Run → FAIL.
**Step 3:** Implement metadata decorator + guard reading the session principal role (BR-002).
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(authz): roles decorator + guard"`

---

### Task A15: CASL ability factory + `@CheckAbility` (child constraints)

**Files:**
- Create: `shared/authz/ability.factory.ts`, `check-ability.decorator.ts`, `ability.guard.ts`
- Test: `shared/authz/__tests__/ability.factory.spec.ts`

**Step 1: Write the failing test** — for a child principal: `can('read','Event')` true,
`can('rsvp','Event')` true, but `can('add','Trainer')`/`can('manage','Payment')`/
`can('purchase','Token')`/`can('delete','Account')` all **false**; non-child principals
unaffected (FR-026, SEC-009).
**Step 2:** Run → FAIL.
**Step 3:** Implement `AbilityFactory.forPrincipal(ctx)` building a CASL ability; child branch
denies the four actions. `@CheckAbility(action,subject)` + `AbilityGuard` enforce on handlers.
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(authz): casl ability factory + check-ability guard for child constraints"`

---

### Task A16: Password reset (request + confirm)

**Files:**
- Create: `modules/auth/entities/password-reset-token.entity.ts` (+ migration),
  `dto/request-password-reset.dto.ts`, `dto/confirm-password-reset.dto.ts`
- Modify: `auth.service.ts`, `auth.controller.ts`
- Test: `modules/auth/__tests__/password-reset.e2e-spec.ts`

**Step 1: Write the failing test** — `POST /auth/password-reset` always 204 (no enumeration);
valid token → `POST /auth/password-reset/confirm` sets new hash; expired (>1h) token → 400
`TOKEN_EXPIRED`.
**Step 2:** Run → FAIL.
**Step 3:** Implement token entity (1h expiry, single-use), reset flow; send via `EmailService`
port (Task A18 stub).
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(auth): password reset request + confirm (1h token)"`

---

### Task A17: Email verification (non-blocking) + first-login password change

**Files:**
- Create: `modules/auth/entities/email-verification-token.entity.ts` (+ migration)
- Modify: `auth.service.ts`, `auth.controller.ts`, `dto/change-password.dto.ts`
- Test: `modules/auth/__tests__/email-verify.e2e-spec.ts`, `first-login.e2e-spec.ts`

**Step 1: Write the failing test** — login succeeds even when `emailVerified=false` (D3,
non-blocking); `POST /auth/verify-email` with valid token sets `emailVerified=true` (24h
expiry); a `mustChangePassword=true` user is forced through
`POST /auth/first-login/change-password` which clears the flag (FR-006).
**Step 2:** Run → FAIL.
**Step 3:** Implement verification token (24h), resend, and the forced-change endpoint.
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(auth): non-blocking email verification + forced first-login change"`

---

### Task A18: `EmailModule` + `StorageModule` ports (stub adapters)

**Files:**
- Create: `shared/integrations/email/email.service.ts` (interface + dev/log adapter),
  `shared/integrations/storage/storage.service.ts` (interface + local adapter)
- Test: `shared/integrations/email/__tests__/email.service.spec.ts`

**Step 1: Write the failing test** — `EmailService.send(...)` invoked by password-reset records
the message in the dev adapter; `StorageService.put(file)` returns a `{ url, thumbnailUrl }`.
**Step 2:** Run → FAIL.
**Step 3:** Implement provider-agnostic interfaces with a dev/log adapter now (real provider =
open gap Q-01.04). Wire into AuthService.
**Step 4:** Run → PASS.
**Step 5:** `git commit -m "feat(integrations): email + storage ports with dev adapters"`

---

### Task A19: Phase A smoke e2e (foundation wiring)

**Files:**
- Test: `apps/backend/src/__tests__/foundation.e2e-spec.ts`

**Step 1: Write the failing test** — full flow: seed an SA + a trainer + a player; login as
trainer → `/me` shows trainer role + trainer context; a tenant-scoped repo read returns only
that trainer's rows (seed a second trainer's row, assert it is filtered out — proves SEC-007);
a child principal hitting a `@CheckAbility('add','Trainer')` route → 403.
**Step 2:** Run → FAIL.
**Step 3:** Add a small seed helper + one throwaway tenant-scoped test entity/route to prove
the filter end-to-end. (Keep the test entity behind a test-only module.)
**Step 4:** Run → PASS. This is the **Phase A acceptance gate**.
**Step 5:** `git commit -m "test(foundation): phase A e2e smoke proving tenancy + authz wiring"`

**✅ Phase A done when A19 passes:** sessions, CLS tenancy, structural tenant filter, roles +
CASL child constraints, password reset, email verify all green.

---

# PHASES B–G — Structured Task Index

> Backend tasks at task-grain (files + intent + verify). Expand a phase to bite-sized TDD with
> `/writing-plans [TASK-001] phase-<X>` when you start it. Each task is still TDD + commit.

## Phase B — User Management Core (Super Admin)

| # | Task | Files (modules/) | Verify |
|---|------|------------------|--------|
| B1 | Role profile entities + migrations (Trainer/Coach/Player profiles, `parentUserId`) | `*/entities/*.entity.ts` | migrations run; FKs intact |
| B2 | `UsersController` directory: `GET /users` (search/role/status filter, paginated) | `users/users.controller.ts`,`.service.ts`,`dto/list-users.query.ts` | 10k seed lists <3s, paginated (NFR-002) |
| B3 | `POST /users` create trainer (SA-only) + invite/temp-pw email | `users/dto/create-trainer.dto.ts` | 201; 409 `EMAIL_EXISTS`; audit row written |
| B4 | `PATCH /users/:id` edit; `GET /users/:id` | `users/...` | email/role immutable here |
| B5 | Deactivate/reactivate (`status` toggle, D7) | `users/...` | reactivate 409 `USER_ANONYMIZED` if `anonymizedAt` set |
| B6 | GDPR `DELETE /users/:id` anonymize in one tx + `UserDeletionLog` | `users/...`,`users/entities/user-deletion-log.entity.ts` | PII scrubbed per US-01.13; FKs preserved; idempotent |
| B7 | `ProfileModule`: `GET/PATCH /me/profile`, photo upload (StorageService) | `profile/*` | role-specific fields; <1s save (NFR-003) |

**Phase B gate:** SA can create/edit/deactivate/reactivate/delete users; profiles editable;
anonymization correct + audited.

## Phase C — ShareLinks & Invitations

| # | Task | Files | Verify |
|---|------|-------|--------|
| C1 | `ShareLink` entity (opaque code unique idx) + migration (D4) | `sharelinks/entities` | unique `code` index |
| C2 | `ShareLinkService.generateStatic/generateUnique` (CSPRNG token; static no-expiry, unique 1-use/7d) | `sharelinks/...` | BR-013/014 honored |
| C3 | `POST /sharelinks`, `GET /sharelinks`, `POST /sharelinks/:id/revoke` | `sharelinks/sharelinks.controller.ts` | revoke flips `active` |
| C4 | Validation pipeline `GET /sharelinks/:code/validate` (gate steps 1–5) | `sharelinks/...` | 404/410 per state; child gate |
| C5 | `POST /join/:code` registration/association branch (anon vs logged-in, BR-005) | `players/players.controller.ts` | new player vs new association vs no-op |
| C6 | Atomic unique-link consume (conditional UPDATE) + association in one tx (edge E) | `sharelinks/...` | concurrent clicks → exactly one wins |
| C7 | Coach invite `POST /coaches/invite` (unique link + email) + single-trainer guard (BR-006) | `coaches/*` | 409 `COACH_ALREADY_ACTIVE_ELSEWHERE` |
| C8 | Coach invitation list + resend (edge A; idempotent per outstanding invite) | `coaches/...` | resend refreshes, no duplicate live links |

**Phase C gate:** player registers (new + existing), coach invited/accepts, all edge cases A–E
covered; static usage increment is async (NFR-004).

## Phase D — Player/Parent Family

| # | Task | Files | Verify |
|---|------|-------|--------|
| D1 | `PlayerProfile` child fields + `TrainerPlayerAssociation` unique `(trainerId,playerProfileId)` | `players/entities` | duplicate association rejected (race-safe) |
| D2 | Create child `POST /players/me/children` (age 1–18, trainer selection) | `players/dto/create-child.dto.ts` | BR-017; optional child login |
| D3 | Manage child↔trainer add/remove (FR-024; remove cancels RSVPs + soft-deletes per-trainer data) | `players/...` | removal soft-delete preserves history |
| D4 | Context switcher `GET /players/me/contexts`, `POST /players/me/context` | `players/...` | active context persists in session (D2) |
| D5 | `ChildLogin` entity + child sub-login auth (constrained principal, D2) | `child-account/*` | login resolves child-under-parent principal |
| D6 | Enforce child constraints via CASL on child routes; ShareLink-block + parent email (FR-027) | `child-account/...` | 403 `CHILD_*`; parent emailed |
| D7 | `ApprovalRequest` entity + state machine (D5) + migration | `approvals/entities` | states + indexes per spec |
| D8 | Approvals API: parent queue `GET /approvals`, `approve`, `deny` | `approvals/approvals.controller.ts` | 409 `APPROVAL_NOT_PENDING` race guard |
| D9 | Payment-type branch + per-child token setting `PATCH .../token-setting` (FR-029) | `approvals/...` | USD always pending; TOKEN ON → auto-approved record |
| D10 | 48h expiry sweep: `SchedulerModule` cron + Postgres advisory lock (A2) | `shared/scheduler/*` | idempotent; single instance per tick |

**Phase D gate:** parent creates children + manages associations; context switching isolates
data; child constraints + approval workflow (USD/token, 48h) all green.

## Phase E — Availability

| # | Task | Files | Verify |
|---|------|-------|--------|
| E1 | `Availability` entity + migration (player + coach) | `availability/entities` | per-profile slots |
| E2 | Player Best Times `GET/PUT /players/:profileId/availability` (per child) | `availability/...` | advisory (BR-015) |
| E3 | Coach My Times `GET/PUT /coaches/me/availability` | `coaches/...` | multiple slots/day |
| E4 | Trainer view + filter `GET /trainers/me/players/availability` | `trainers/...` | filter by day/time |
| E5 | Conflict check + override contract (override logged; coach-notify = open gap Q-01.06) | `availability/...` | override requires reason (BR-016) |

**Phase E gate:** availability set by player/coach, viewed/filtered by trainer; override logged.

## Phase F — Super Admin Tooling (Impersonation + Audit)

| # | Task | Files | Verify |
|---|------|-------|--------|
| F1 | `AuditModule` + `AuditService` (centralized writes) | `shared/audit/*` | impersonation/deletion/override logged |
| F2 | `ImpersonationLog` entity + migration | `impersonation/entities` | bracket fields |
| F3 | `POST /impersonation/:userId` (SA→SA blocked, 1h cap, session pair) | `impersonation/...` | 403 `CANNOT_IMPERSONATE_SUPER_ADMIN` |
| F4 | `POST /impersonation/exit` (+ auto-close at 1h) | `impersonation/...` | bracket closed; duration set |
| F5 | Dual-actor write attribution (D6) on mutations while impersonating | cross-cutting | both IDs stamped |
| F6 | `GET /impersonation/history` (paginated, filters) | `impersonation/...` | report renders |

**Phase F gate:** impersonate/exit with audit + dual-actor attribution; SA→SA blocked; 1h cap.

## Phase G — Branding + Accessibility + Perf Hardening

| # | Task | Files | Verify |
|---|------|-------|--------|
| G1 | `PortalBranding` entity + `GET/PUT /trainers/me/branding` + logo upload | `trainers/...` | hex validation; ≤2MB logo |
| G2 | Indexing pass (all `trainerId`, approval indexes, session indexes, email unique) | migrations | EXPLAIN confirms index use |
| G3 | Perf checks vs NFRs (dashboard <2s, user list 10k <3s, profile save <1s) | load test scripts | targets met |
| G4 | Security review pass (cross-tenant, child constraints, SA→SA, anonymization, rate limit, CSRF) | — | all SEC-* asserted by tests |

**Phase G gate:** branding live; indexes in place; NFRs met; security checklist green.

---

## Frontend Follow-On (referenced, not planned here)

Per the backend-first decision, generate the FE plan after the Phase A–C APIs run:
`/writing-plans [TASK-001] frontend`. It will implement, against `specs/frontend-design-spec.md`:
design-system tokens (Clash Display / Satoshi / Martian Mono, `--brand` white-label token +
runtime contrast guard) → the signature **ContextSwitcher/Masthead** + **ImpersonationBanner**
→ Login/Registration → SA UsersTable/CreateUserModal → FamilyDashboard → BestTimes/MyTimes
grids → ShareLinkModal → ApprovalsQueue → ProfileEdit. React + Motion; WCAG 2.1 AA (NFR-006).

## Cross-Epic Boundaries (do not build here)

Event-assignment conflict override UI/flow (Epic-02) · ApprovalRequest creation on checkout +
payment processing (Epic-02/05) · ShareLink usage analytics consumption (Epic-06) ·
Camp-to-User pre-fill (Epic-08).

## Open Gaps (resolve before the dependent task)

Q-01.01 skill-level enum (B1/B7) · Q-01.02 age-group model (D2) · Q-01.04 email provider +
full template list (A18) · Q-01.06 coach-override notification (E5) · Epic-05 payment field
ownership (B1 TrainerProfile) · Epic-08 camp field mapping (C5 variant).

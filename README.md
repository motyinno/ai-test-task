# PracticePerfect — Sports Training Platform

> A multi-tenant platform connecting Super Admins, Trainers (business owners), Coaches, and Players/Parents. **Epic-01 (User Management & Authentication) is complete** and ships the auth foundation, multi-role RBAC, multi-tenant isolation, family accounts, and Super Admin tooling that all downstream epics build on.

## Project Overview

**PracticePerfect** is a web platform that helps trainers manage their sports businesses by connecting with coaches and players/parents. The system supports four distinct roles with separated, role-specific views:

- **Super Admin:** Oversees the platform; creates trainers; views impersonation history; manages content moderation.
- **Trainer:** Business owner; runs an isolated organization; manages coaches, players, availability, and portal branding.
- **Coach:** Works under a single trainer; sets availability ("My Times"); manages events and player RSVPs.
- **Player/Parent:** Self-serves across multiple trainers; registers via ShareLink invitation; manages children, approval workflows, and availability ("Best Times").

**Epic-01 completes the P0 foundation:** server-side session authentication, role-based access control (RBAC), multi-tenant data isolation, family account workflows (parent + child profiles), child purchase approvals, coach availability conflict resolution, impersonation with audit logging, and GDPR-compliant data deletion.

## Architecture

The system is built in two layers:

```
┌─────────────────────────────────────────────────────┐
│ Backend: NestJS (TypeScript) + PostgreSQL           │
│ - Layered: Controller → Service → Repository        │
│ - Multi-tenancy: AsyncLocalStorage (nestjs-cls)    │
│ - Auth: Passport local + express-session (cookie)  │
│ - Authz: @Roles() + CASL child constraints         │
│ - Session store: Postgres (connect-pg-simple)      │
└─────────────────────────────────────────────────────┘
                          ↓ HTTP (session cookie)
┌─────────────────────────────────────────────────────┐
│ Frontend: Vite + React (TypeScript)                 │
│ - Design system: PracticePerfect (light + dark)    │
│ - State: TanStack Query + React hooks               │
│ - Tokens: PracticePerfect design tokens (Tailwind)  │
│ - Vite dev proxy: /api → http://localhost:3000     │
└─────────────────────────────────────────────────────┘
```

For detailed architecture, schema design, API contracts, and module dependency graphs, see:
- **`specs/architect-architecture.md`** — System design, multi-tenancy, auth, transaction boundaries, scheduler.
- **`specs/api-designer-spec.md`** — Endpoint contracts, status codes, error shapes, session model.
- **`specs/frontend-design-spec.md`** — Pages, components, state management, design tokens.
- **`specs/MANIFEST.md`** — Project index and key decisions.

## Prerequisites

### Node.js & npm

Node 18+ required. Verify:
```bash
node -v && npm -v
```

### Docker (for PostgreSQL)

Docker is required to run the development and test databases locally.

```bash
docker --version
```

Ensure Docker daemon is running before starting services.

---

## Backend Setup & Run

The backend is a NestJS Nx monorepo at `/backend` with the API app under `backend/apps/api`.

### 1. Install Dependencies

```bash
cd backend && npm install
```

### 2. Start PostgreSQL (Development)

From the backend directory, start the dev Postgres container:

```bash
docker compose up -d postgres
```

Verify it's ready:
```bash
docker ps | grep postgres
```

**Database:** `trainer_app_dev` | **Port:** 5432  
**Credentials:** user=`trainer_app`, password=`trainer_app_pass`

### 3. Run Migrations

Create the schema by running all pending migrations (Phase A through Phase G):

```bash
export DATABASE_URL="postgresql://trainer_app:trainer_app_pass@localhost:5432/trainer_app_dev"
node apps/api/src/shared/database/run-migrations.mjs
```

This is idempotent; re-running is safe.

### 4. Seed a Super Admin (Dev Only)

There is **no public signup** by design — trainers are created by a Super Admin, and players join via ShareLink invitations. To log in for the first time, a Super Admin must exist in the database.

Insert a Super Admin row directly (one-time, dev-only):

```bash
# From backend/
psql "postgresql://trainer_app:trainer_app_pass@localhost:5432/trainer_app_dev" -c "
INSERT INTO users (
  id, email, password_hash, role, status, email_verified, created_at
) VALUES (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'admin@example.com',
  '\$argon2id\$v=19\$m=19456,t=2,p=1\$zqkKqiBEfCwXCRfG3sLFUg\$v5C33m2lWOzlOt7gQzjCKvzY7VHJ1dNOPwLkqLMUVc4',
  'SUPER_ADMIN',
  'ACTIVE',
  false,
  NOW()
) ON CONFLICT DO NOTHING;
"
```

**Login credentials:**
- Email: `admin@example.com`
- Password: `password123` (the hash above is argon2-hashed; the plain password used in production should be securely generated and transmitted via email or secure channel)

**Note:** For production, use a secure temporary password generated by the system and sent via email; never hardcode passwords.

### 5. Start the Backend

Set environment variables and run the development server:

```bash
export NODE_ENV=development
export DATABASE_URL="postgresql://trainer_app:trainer_app_pass@localhost:5432/trainer_app_dev"
export SESSION_SECRET="dev-secret-change-in-prod"
export PORT=3000

npx nx serve api
```

Expected output: Backend listens on `http://localhost:3000`, API base at `http://localhost:3000/api/v1`.

---

## Frontend Setup & Run

The frontend is a standalone Vite + React app at `/frontend`.

### 1. Install Dependencies

```bash
cd frontend && npm install
```

### 2. Start Development Server

```bash
npm run dev
```

Expected output: Frontend listens on `http://localhost:5173`.

**API proxy:** During development, requests to `/api/*` are automatically proxied to `http://localhost:3000`. See `vite.config.ts` for proxy config.

### 3. Open in Browser

Navigate to `http://localhost:5173` and log in with the Super Admin credentials created above (or register as a new player via ShareLink once a trainer creates one).

---

## Testing

### Backend Tests

Tests use a separate test Postgres database on port 5433:

```bash
cd backend

# Start the test database (one time)
docker compose up -d postgres_test

# Run all tests (serial; required for shared e2e DB)
export NODE_ENV=test
npx nx test api --maxWorkers=1

# Watch mode (optional)
npx nx test api --maxWorkers=1 --watch
```

**Coverage:** 330+ tests across 50+ suites (unit + integration + e2e).

### Frontend Tests

```bash
cd frontend

# Run tests once
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

**Coverage:** 120+ tests covering components, pages, API client, and routing.

---

## Architecture & Modules (Backend)

| Module | Responsibility | Type |
|--------|----------------|------|
| **AuthModule** | Login/logout, Passport local strategy, session wiring, password reset, email verify, rate limiting | Feature |
| **UsersModule** | Super Admin directory, user CRUD, status transitions (active/inactive/deleted), GDPR anonymization | Feature |
| **TrainersModule** | Trainer creation (SA-only), org-scoped queries, portal branding (logo + accent color) | Feature |
| **CoachesModule** | Coach invite/accept, single-trainer enforcement, My Times availability, public profile | Feature |
| **PlayersModule** | ShareLink registration, multi-trainer association, child profiles, context switching | Feature |
| **ChildAccountModule** | Constrained sub-login auth, CASL child constraints (view/RSVP allowed, add-trainer/payment denied) | Feature |
| **ShareLinksModule** | Generate static (unlimited) / unique (1-use, 7-day) links, validation, atomic consumption | Feature |
| **ApprovalsModule** | Child purchase approval state machine (Pending → Approved/Denied/Expired), 48h auto-expiry | Feature |
| **AvailabilityModule** | Player Best Times / Coach My Times, conflict checks, trainer override (logged, notifies coach) | Feature |
| **ImpersonationModule** | SA impersonate users (1h cap), start/exit, bracketed audit, dual-actor attribution | Feature |
| **NotificationsModule** | In-app notifications (availability override, general types), per-user, mark-read | Feature |
| **AuthzModule** | `@Roles()` guard, CASL ability factory, tenant-aware policy enforcement | Cross-cutting |
| **TenancyModule** | CLS-based tenant context, `TenantAwareRepository` base (structural filter), tenant interceptor | Cross-cutting |
| **AuditModule** | Centralized audit writes (impersonation, deletion, override) | Cross-cutting |

Full module dependency graph: see `specs/architect-architecture.md`.

---

## Key Design Patterns

### Multi-Tenancy (Org Isolation)

- **Propagation:** Tenant context flows via `nestjs-cls` (AsyncLocalStorage), not request-scoped DI (preserves performance at scale).
- **Filtering:** A `TenantAwareRepository` base automatically appends `WHERE trainerId = :ctx` to every org-bound query. Structural, not per-call — developers cannot forget it.
- **Escape Hatch:** Super Admin / impersonation paths use explicit `withoutTenantScope()`, all audited.

### Authentication & Authorization (Hybrid)

- **AuthN:** Server-side sessions (Passport local + express-session on Postgres) with opaque httpOnly cookies. CSRF tokens on state-changing operations. No JWT.
- **AuthZ:** Three independent layers:
  1. **Role gate:** `@Roles()` decorator checks coarse role membership.
  2. **Tenant isolation:** Structural filter (data layer).
  3. **Child constraints:** CASL scoped to child sub-login rules (view/RSVP allowed, add-trainer/payment denied).

### Session Model

- **Timeouts:** 30-day sliding absolute lifetime, ~14-day idle cap, 1h hard impersonation cap.
- **Payload:** Carries impersonation pair, child sub-login principal, and active context (active profile + active `trainerId`).
- **Context propagation:** Active context is the source for CLS `TenantContext`.

### Transactions & Atomicity

Multi-write operations (GDPR delete, unique ShareLink consume, approval resolution, impersonation write) execute in a single service-method transaction. Single writes/reads use implicit transactions.

### Scheduler (Approvals Expiry)

- **Strategy:** In-process `@nestjs/schedule` cron guarded by Postgres advisory lock (efficient, no Redis).
- **Idempotency:** Expiry sweep is a guarded conditional UPDATE — safe even on double-fire.

---

## Known Limitations & Gaps

### Not Yet Implemented

- **CI/CD:** No GitHub Actions / CI pipeline configured (Epic for later).
- **Lint/Format:** Linting not wired in the CLI (manual runs available; no pre-commit hook).
- **End-to-end Events/Payments:** Epics 02, 05 (out of scope for Epic-01).
- **Real SMTP Email:** Nodemailer adapter uses dev log-adapter by default; set `EMAIL_PROVIDER=smtp` to enable real SMTP (requires SMTP_HOST/PORT/USER/PASS/FROM env vars).

### Resolved Gap Decisions (PR #10 & PR #11 pending merge)

The following open questions from the first TASK-001 docs pass have been **resolved** in branches `task-001/gap-resolutions` and `task-001/frontend-screens`:

| ID | Decision | Status |
|----|----------|--------|
| **Q-01.01** | SkillLevel enum: `BEGINNER \| INTERMEDIATE \| ADVANCED \| ELITE` (trainer-set, nullable) | ✅ Resolved (PR #10 pending) |
| **Q-01.02** | Age model: store `dateOfBirth` (ISO date), derive `age` + `ageGroup` (U6–U18) at read | ✅ Resolved (PR #10 pending) |
| **Q-01.04** | Email adapter: Nodemailer SMTP adapter + full transactional template registry (welcome, reset, verify, invites, approvals, child-blocked, override) | ✅ Resolved (PR #10 pending) |
| **Q-01.06** | Coach override notification: coach receives email + in-app Notification on availability override | ✅ Resolved (PR #10 pending) |
| **Epic-05 boundary** | TrainerProfile payment fields (`stripeAccountId`, future subscription/fee) are nullable placeholders owned by Epic-05; Epic-01 stores only | ✅ Documented (PR #10) |
| **Epic-08 boundary** | Camp-to-User field mapping: `JoinViaLinkDto` carries registration fields; Epic-08 implements pre-fill mapping | ✅ Documented (PR #10) |

---

## Development Workflow

### Adding a Feature

1. **Create a feature module** under `backend/apps/api/src/modules/[feature]/`:
   - `[feature].module.ts` — module definition
   - `[feature].controller.ts` — HTTP handlers
   - `[feature].service.ts` — business logic
   - `[feature].repository.ts` — data access (extend `TenantAwareRepository` if org-bound)
   - `entities/` — TypeORM entities
   - `dto/` — validation & response DTOs
   - `__tests__/` — unit + e2e tests

2. **Import into `app.module.ts`** and ensure dependency order (see MANIFEST).

3. **Test:** Write tests first (TDD). E2E tests use the test Postgres (`NODE_ENV=test`).

4. **Commit:** One feature per commit; include test coverage in the message (e.g., `feat(coaches/C11): coach invite + acceptance`).

### Database Changes

1. **Create a migration** in `backend/apps/api/src/shared/database/migrations/`:
   ```typescript
   export class MigrationName1234567890000 {
     async up(queryRunner) { /* SQL */ }
     async down(queryRunner) { /* SQL */ }
   }
   ```

2. **Export from `run-migrations.mjs`** and test:
   ```bash
   DATABASE_URL=... node apps/api/src/shared/database/run-migrations.mjs
   ```

3. **Verify idempotency** — re-running should be safe.

### Building for Production

**Backend:**
```bash
cd backend && npm run build
# Output: dist/apps/api (ready for container or deploy)
```

**Frontend:**
```bash
cd frontend && npm run build
# Output: dist/ (static assets; serve via CDN or static server)
```

---

## Environment Variables

### Backend (.env or process.env)

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `DATABASE_URL` | — | PostgreSQL connection: `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | — | Encryption key for session store; should be a strong random string in production |
| `PORT` | 3000 | HTTP listen port |
| `EMAIL_PROVIDER` | `log` (dev default) | Email provider: `log` (dev/test, logs to console) or `smtp` (production) |
| `SMTP_HOST` | — | SMTP server hostname (required if `EMAIL_PROVIDER=smtp`) |
| `SMTP_PORT` | — | SMTP server port (required if `EMAIL_PROVIDER=smtp`), typically 587 (TLS) or 465 (SSL) |
| `SMTP_USER` | — | SMTP authentication username (required if `EMAIL_PROVIDER=smtp`) |
| `SMTP_PASS` | — | SMTP authentication password (required if `EMAIL_PROVIDER=smtp`) |
| `SMTP_FROM` | — | Sender email address (required if `EMAIL_PROVIDER=smtp`), e.g., `noreply@example.com` |

### Frontend (.env.* or import.meta.env)

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE` | `/api` | API base path (proxied via Vite during dev) |

For production deploys, ensure the frontend can reach the backend API at the correct origin (no localhost).

---

## Debugging & Troubleshooting

### Backend

**Postgres connection error:**
```
error: connect ECONNREFUSED 127.0.0.1:5432
```
→ Start Postgres: `docker compose up -d postgres`

**Migration failure:**
→ Ensure `DATABASE_URL` is set and Postgres is running. Check the error message for SQL syntax or FK violations.

**Session store locked:**
→ The `sessions` table is created automatically by `connect-pg-simple`. If migrations fail, manually create it or drop and re-migrate.

**Rate limiting errors (429):**
→ Throttle keys (e.g., login attempts) reset after configured window (defaults: 10 requests/15 min). See `AuthModule` for tweaks.

### Frontend

**Proxy errors (502 on `/api/*`):**
→ Ensure backend is running on `http://localhost:3000`. Check `vite.config.ts` proxy config.

**CORS errors:**
→ Backend sessions use `credentials: 'include'` (secure cookie). Ensure browser allows credentials and the origin is trusted.

**Build errors:**
```
npm run build
```
→ Check TypeScript errors: `tsc -b`. Ensure all dependencies are installed.

---

## Release & Deployment

This section is a placeholder for future deployment guidance. Currently:

- **Backend:** Containerize via Dockerfile (TBD) and deploy to a Node-capable platform (Heroku, ECS, K8s, etc.).
- **Frontend:** Build static assets and serve via CDN or static server (Vercel, Netlify, S3 + CloudFront, etc.).

Ensure the frontend's API base URL points to the production backend origin.

---

## Documentation

- **This README** — Run guide and architecture overview.
- **`specs/MANIFEST.md`** — Project overview and key decisions.
- **`specs/architect-architecture.md`** — Detailed system design, multi-tenancy, auth, transaction boundaries.
- **`specs/api-designer-spec.md`** — Full API contracts, DTOs, error shapes, session model.
- **`specs/frontend-design-spec.md`** — Pages, components, routing, state management, design tokens.
- **`docs/documentation-generator-architecture-overview.md`** — Contributor-facing architecture summary with module map and PR history.

For GDPR-related details, see `specs/architect-architecture.md` (D7 — delete model) and `modules/users/` implementation.

---

## License & Attribution

Built with [NestJS](https://nestjs.com/), [TypeORM](https://typeorm.io/), [React](https://react.dev/), [Vite](https://vitejs.dev/), and [TailwindCSS](https://tailwindcss.com/).

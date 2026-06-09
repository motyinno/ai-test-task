# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Epic-01] - 2026-06-09

**Complete Foundation:** User Management & Authentication (Phases A–G) merged to master. Backend fully tested (330+ tests, 50+ suites). Frontend foundation (auth, profile, context switching, impersonation) integrated. Platform ready for downstream epics (Events, Payments, Scheduling, etc.).

### Added

#### Phase A: Foundation (Auth, Tenancy, RBAC)
- Scaffold NestJS Nx monorepo + PostgreSQL + TypeORM setup
- Config module with environment loading
- Global validation pipe, HTTP error filter, health check endpoint
- CLS-based tenant context propagation (AsyncLocalStorage via nestjs-cls)
- TenantAwareRepository base class with structural multi-tenant filtering
- Passport local strategy + express-session with Postgres session store
- RolesGuard + CASL ability factory for hybrid authorization
- Rate limiting on auth endpoints (brute-force protection)
- Docker Compose setup for dev/test Postgres instances

#### Phase B: User Management (CRUD, Profiles, GDPR)
- Users module: Super Admin global directory with search/filter
- Create trainer account (SA-only) with temp password or invite link
- User status transitions: Active → Inactive → (optionally) Deleted
- GDPR anonymization: PII scrub, UserDeletionLog audit trail, FKs preserved
- Profile modules: TrainerProfile, CoachProfile, PlayerProfile (1–1 per role)
- Profile edit + photo upload via StorageService (local disk for dev)
- Force password change on first login (temp password flow)
- Email verification (non-blocking, per D-3)
- Password reset flow (1h expiry)
- Full e2e & unit test coverage

#### Phase C: ShareLinks & Invitations (Registration, Coach Invite)
- ShareLink entity + opaque CSPRNG code generation (D4)
- Static ShareLinks (unlimited use, no expiry) for player registration
- Unique ShareLinks (1 use, 7-day expiry) for coach invitations
- Public validation pipeline + `/sharelinks/:code/validate` endpoint
- Atomic single-use consume with race condition protection (edge E)
- Trainer: list, revoke, and view usage analytics for ShareLinks
- Player registration via static link: create account + profile + trainer association
- Existing player association via static link (no duplicate, BR-005)
- Coach invitation + acceptance workflow, single-trainer enforcement (BR-006)
- Coach invitation list + idempotent resend (edge A)
- Child-aware blocking: child clicking new-trainer link → blocked + parent notified

#### Phase D: Family Accounts & Approvals (Children, Context Switching, Purchase Approval)
- Player/Parent: register as own player + manage children
- Child profiles: Create (name/age/gender/optional) + trainer associations
- Parent manages child-trainer associations (add via ShareLink, remove with cleanup)
- Context switching UI: "Me" (parent as player) + children + child-specific data isolation
- Child constrained sub-login: view/RSVP allowed, add-trainer/payment/delete denied (FR-026)
- CASL child constraints with per-profile token approval settings
- Child purchase approval (USD & tokens): Pending → Approved/Denied/Expired/Cancelled
- 48h auto-expiry via Postgres advisory lock + in-process scheduler (D5)
- Parent approval/denial workflow + admin request-info flow
- Per-child token spend approval toggle (default: OFF → approval required)

#### Phase E: Availability (Best Times / My Times, Conflict Resolution)
- Player "Best Times": set recurring weekly availability (day/time grid)
- Coach "My Times": set recurring weekly availability (multiple slots/day)
- Trainer view: player availability summary (filter by availability, conflict indicators)
- Conflict detection: assign coach at conflicting time → warning
- Conflict override: trainer override with logged reason (edge M)
- Availability indices: `(status, trainerId, expiresAt)` for efficient queries + scheduler

#### Phase F: Impersonation & Audit (Super Admin Tooling, Compliance)
- Impersonation module: SA impersonate any user (except SA→SA, SEC-008)
- 1h hard impersonation cap with countdown timer
- Start/exit/history endpoints + sticky hazard banner on impersonated sessions
- ImpersonationLog entity: bracket-style audit (start + end, duration, reason)
- Dual-actor attribution: log both real admin + impersonated subject
- Impersonation history: Super Admin report (filterable, paginated)
- AuditModule: centralized write logging for sensitive operations
- Delete/anonymize audit trail

#### Phase G: Branding & Polish (Portal Customization, Performance, Security Hardening)
- Portal branding: trainer logo upload (PNG/JPG/SVG ≤2MB)
- Brand accent color: hex picker with WCAG contrast guard
- Live preview on branding form
- PortalBranding entity + repository with caching strategy
- Performance hardening: indexing pass, query optimization, migration runner G update
- Security assertion sweep: review & document all auth boundaries, tenant filters, CASL rules
- Perf results documented in `backend/apps/api/perf/coder-perf-results.md`

#### Frontend (Vite + React)
- Standalone Vite + React TypeScript project
- Session-based auth client (no JWT; uses httpOnly cookies + CSRF tokens)
- Login page (email/password)
- Join page (ShareLink registration)
- Profile page (edit all roles, photo upload)
- Users page (Super Admin: create, list, edit, delete/anonymize users)
- Context switcher (signature masthead; parent sees "Me" + children)
- Impersonation banner (hazard tape styling, countdown timer, exit button)
- ShareLink sheet (trainer generates static/unique links, copy, revoke, analytics)
- PracticePerfect design system: Editorial Athletic tokens (light/dark, warm-paper/ink, brand accent)
- Fonts: Clash Display (display), Satoshi (body), Martian Mono (data)
- Tailwind CSS + CSS variables for runtime theming
- TanStack React Query for API state management
- React Router v7 with role-based route guards
- MSW for mock API in tests
- Vitest + RTL for component/integration tests
- WCAG a11y smoke tests + contrast assurance

### Changed

- **Entity types fix (PR #4):** Explicit VARCHAR type on nullable string columns for app boot compatibility (M-3, M-4)
- Frontend design spec reconciled to PracticePerfect tokens (Tailwind CSS vars)

### Fixed

- **M-1:** Catch Postgres 23505 (unique constraint) on CoachProfile INSERT → map to 409 Conflict
- **M-2:** Add cross-tenant isolation test for coach list/resend (security validation)
- **M-3, M-4:** Explicit VARCHAR type on nullable string columns (DataSource initialization)
- **C-2:** Coach invite idempotency — refresh outstanding link instead of duplicate INSERT
- **C-1:** Remove targetEmail from public `/sharelinks/:code/validate` response (disclosure)

### Security

- Multi-tenant structural filtering at data layer (TenantAwareRepository, SEC-007)
- SA→SA impersonation blocked (SEC-008)
- 1h impersonation time cap (SEC-005)
- CSRF tokens on state-changing operations (SEC-002, SEC-003)
- Argon2 password hashing + force change on temp passwords (SEC-001)
- Audit logging: impersonation bracket, deletion, override (SEC-006)
- Email verification link 24h expiry, password reset 1h expiry
- Rate limiting on login + password reset endpoints (SEC-004)
- Child sub-login constraints: view/RSVP only, add-trainer/payment denied (SEC-009)

### Documentation

- Living specs: `specs/architect-architecture.md`, `specs/api-designer-spec.md`, `specs/frontend-design-spec.md`, `specs/MANIFEST.md`
- Task docs: `tasks/TASK-001/requirements-analyst-requirements.md`, `brainstorming-design.md`, `writing-plans-plan.md`
- Root `README.md`: run guide (backend, frontend, testing, seeding, env setup)
- `docs/documentation-generator-architecture-overview.md`: contributor-facing module map + design patterns
- Perf results + security checklist: `backend/apps/api/perf/`

### Test Coverage

- **Backend:** 330+ tests across 50+ suites (unit, integration, e2e)
  - Auth: login, logout, rate limiting, password reset
  - Users: CRUD, deactivate, GDPR delete, anonymization
  - ShareLinks: generate, validate, consume (atomic), list, revoke
  - Players: registration, multi-trainer association, child context
  - Child auth: sub-login, CASL constraints, approval workflow
  - Coaches: invite, accept, single-trainer enforcement
  - Availability: Best Times, My Times, conflict detection, override
  - Impersonation: start, exit, history, audit logging
  - Branding: logo upload, color picker, WCAG contrast
  - Multi-tenancy: cross-tenant isolation verification

- **Frontend:** 120+ tests (components, pages, routing, API client)
  - Auth: login form, logout, session state
  - Pages: login, join, profile, users admin
  - Context: switcher (parent/children), isolation
  - Impersonation: banner display, auto-exit
  - ShareLinks: generate, copy, revoke
  - A11y: smoke tests, contrast assurance

### Known Gaps (Out of Scope)

- Email service integration (SMTP/Sendgrid) — placeholder service exists
- File storage: local disk (cloud S3/GCS integration deferred)
- CI/CD pipeline (GitHub Actions)
- Lint/format enforcement in CLI
- Frontend screens for Approvals/Availability/Family management (pending Epic-02+)

---

## [1.1.0] - 2026-05-18

### Added
- Add context graph — MOC-based skill navigation across 4 workflow phases (3ae9432)
- Add graphs for command > agent > skill flow (3fbebda)
- Add harness engineering: stabilization cycle, Definition of Done, golden principles, and automated hooks (bc975f0)
- Add WCAG accessibility skill — 30 rules across 8 categories (3ae9432)
- Add browser-verify skill (f36b5f6)
- Add review-pr skill (2d9ec09)
- Add ctx7 CLI skill and README (f081526)
- Add RTK, high-performance CLI proxy that reduces LLM token consumption by 60-90% (6ab0c22)

### Changed
- Update skill-creator with evals and benchmarking (b7d05f5)
- Update agent-browser (84516af)
- Replace MCP usage with CLI+Skill approach (7721cb4)

### Fixed
- Fix table appearance (62c17dd)
- Fix brainstorm to ask about libraries (68df0e0)
- Fix agent-browser to use CLI (624b262)

### Removed
- Remove prompt enhancer (1aa103a)

## [1.0.0] - 2026-02-10

### Added
- Add task management system (4d6da8e)
- Add new documentation system and flow (a8ca446)
- Add changelog/release skill (d712cc5)
- Add React best practices skill (8135458)
- Add git worktrees support (f08ed46)
- Add document generation capabilities (86a4fdf)
- Add task tool integration in commands (94fde83)
- Add updated agent configurations (a2d4edc)
- Include project-generator in flow (e1416b3)
- Add new flow without orchestration (71f7071)
- Add README (dd8064f)
- Add release workflow and skill updates (ee0e08f)

### Fixed
- Fix folder structure (f566ece)
- Fix lint spec descriptions (1aa3cf1)
- Fix manifest path resolution (5360449)
- Fix absolute paths (493d639)
- Fix worktree variant selection (853b0e4)
- Simplify commands (67c6841)
- Remove unnecessary commands (c0a595d)
- Fix lint issues (1e44a91)

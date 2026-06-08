# Project: Sports Training Platform

A multi-tenant platform connecting Super Admins, Trainers (business owners), Coaches, and
Players/Parents. Trainers run isolated organizations; players/parents self-serve across
multiple trainers with separated views; Super Admins oversee and support the platform.
Epic-01 establishes the user-management & authentication foundation that all other epics
build on.

## Specs Index

| File | Purpose | Depends On | Last Updated |
|------|---------|------------|--------------|
| architect-architecture.md | System design, components, data flow | - | 2026-06-08 |
| api-designer-spec.md | Endpoints, schemas, authentication | architect-architecture | 2026-06-08 |
| frontend-design-spec.md | Pages, components, state management | architect-architecture, api-designer-spec | 2026-06-08 |
| docs-generator-implementation.md | Build process, deployment, tooling | - | - |

## Key Decisions

- **Architecture:** Layered NestJS (Controller → Service → Repository); feature modules in
  `modules/`, cross-cutting infra in `shared/`.
- **Multi-tenancy:** App-layer scoping. `TenantContext` propagated via **AsyncLocalStorage
  (nestjs-cls)**; a `TenantAwareRepository` base structurally filters every org-bound query
  by `trainerId` (SEC-007). Audited escape hatch for Super Admin/impersonation.
- **AuthN:** Server-side sessions — **Passport + express-session**, opaque httpOnly cookie,
  **Postgres session store**. 30-day sliding / ~14-day idle / 1h impersonation caps.
  Passwords hashed (bcrypt/argon2). Email verification non-blocking.
- **AuthZ:** Hybrid — `@Roles()` guard (role gate) + structural tenant filter (org isolation)
  + **CASL** scoped to child sub-login constraints.
- **ShareLinks:** Opaque random CSPRNG token (unsigned); DB row authoritative for
  type/expiry/uses/active. Static = unlimited; unique = 1-use/7-day, atomic consume.
- **Approvals:** Dedicated `ApprovalRequest` state machine (Pending → Approved/Denied/
  Expired/Cancelled). 48h auto-deny via in-process scheduler + Postgres advisory lock.
- **Delete model:** `status {Active,Inactive,Deleted}` (reversible) + `anonymizedAt`
  (irreversible GDPR scrub); FKs preserved; `UserDeletionLog` for compliance.
- **Impersonation:** Bracketed `ImpersonationLog` + dual-actor write attribution; SA→SA blocked.
- **API conventions:** Base `/api/v1`; **UUID v4** resource IDs (`ParseUUIDPipe`, anti-enumeration);
  bare body for single resources + `{ data, meta }` page-based envelope for lists; Nest-style
  error shape; `@ApiCookieAuth('session')` + `X-CSRF-Token` (no bearer tokens).
- **Frontend aesthetic:** "Editorial Athletic" — light default + dark option. Color-neutral
  warm-paper/ink canvas; trainer brand color is the single dynamic accent (`--brand` token,
  runtime contrast-guarded); SA chrome stays monochrome. Fonts: Clash Display (display) /
  Satoshi (body) / Martian Mono (data). Signatures: masthead context switcher, tale-of-the-tape
  numerals, hazard-tape impersonation banner. React + Motion (Framer Motion).

## Tech Stack

- **Backend:** NestJS (TypeScript), layered architecture
- **Database:** PostgreSQL (also hosts the session store)
- **Auth:** Passport (local strategy) + express-session, server-side sessions
- **Authorization:** `@Roles()` guards + CASL (`@casl/ability`) for fine-grained child rules
- **Context propagation:** `nestjs-cls` (AsyncLocalStorage) for tenant/request context
- **Scheduling:** `@nestjs/schedule` (in-process) + Postgres advisory locks
- **Validation / rate limiting:** `class-validator`, `@nestjs/throttler`
- **Integrations (ports):** Email service, File storage (profile photos, logos)

---

*This manifest is updated automatically by architect, api-designer, and frontend-design skills.*
*See `../spec-desc.md` for specification structure guidelines.*

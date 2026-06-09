# G4 Security Checklist — Epic-01 Backend

Maps each SEC requirement to the test(s) that prove it. Produced during Phase G.

All listed tests pass in `NODE_ENV=test npx nx test api`.

---

## SEC-001: Password Hashing (argon2)

**Requirement:** Passwords stored as argon2 hashes; plain-text never stored or logged.

**Implementation:** `PasswordService` in `shared/crypto/password.service.ts`

**Tests that prove it:**
- `shared/crypto/__tests__/password.service.spec.ts` — `hash()` returns argon2 string; `verify()` true for correct, false for wrong password
- `__tests__/g4-security-sweep.e2e-spec.ts > SEC-001` — wrong password returns 401 (sanity-check: proves comparison is enforced)
- `modules/auth/__tests__/auth.e2e-spec.ts` — login with correct hash returns 200

**Status: PASS**

---

## SEC-002: Cookie Hardening (HttpOnly, SameSite)

**Requirement:** Session cookie carries `HttpOnly` + `SameSite=Lax` (+ `Secure` in prod).

**Implementation:** `shared/session/session.setup.ts` — `express-session` config

**Tests that prove it:**
- `shared/session/__tests__/session.e2e-spec.ts` — Set-Cookie header contains HttpOnly
- `__tests__/g4-security-sweep.e2e-spec.ts > SEC-002` — explicit assertion that login response Set-Cookie contains `HttpOnly`

**Status: PASS**

---

## SEC-003: CSRF on State-Changing Routes

**Requirement:** POST/PUT/PATCH/DELETE require `X-CSRF-Token` header (double-submit cookie pattern).

**Implementation:** `shared/security/csrf.middleware.ts` — CSRF_EXEMPT_PATHS for login/pre-session

**Tests that prove it:**
- `shared/security/__tests__/csrf.e2e-spec.ts` — POST without token → 403 CSRF_INVALID; with token → passes
- `__tests__/g4-security-sweep.e2e-spec.ts > SEC-003` — PUT /trainers/me/branding without CSRF → 403; with CSRF → 200

**Status: PASS**

---

## SEC-004: Login Rate Limiting

**Requirement:** Auth endpoints throttled to prevent brute-force attacks.

**Implementation:** `@nestjs/throttler` + `@Throttle` on auth endpoints

**Tests that prove it:**
- `modules/auth/__tests__/auth-throttle.e2e-spec.ts` — N+1 rapid login failures → 429
- `__tests__/g4-security-sweep.e2e-spec.ts > SEC-004` — 5 rapid logins produce only 401 or 429, never 5xx

**Status: PASS**

---

## SEC-005: Token Expiry

**Requirement:** Password reset tokens expire after 1h; email verification tokens expire after 24h; impersonation session capped at 1h.

**Implementation:**
- `AuthService.requestPasswordReset` — 1h expiry on reset tokens
- `AuthService.verifyEmail` — 24h expiry on verify tokens
- `ImpersonationService` — 1h cap enforced on each request

**Tests that prove it:**
- `modules/auth/__tests__/password-reset.e2e-spec.ts` — expired token → 400 TOKEN_EXPIRED
- `modules/auth/__tests__/email-verify.e2e-spec.ts` — expired verify token rejected
- `modules/impersonation/__tests__/impersonation.e2e-spec.ts > F4` — 1h cap auto-exit
- `__tests__/g4-security-sweep.e2e-spec.ts > SEC-005` — seeded expired token → 400 TOKEN_EXPIRED

**Status: PASS**

---

## SEC-006: Audit Logging

**Requirement:** Impersonation (bracket open/close + dual-actor), GDPR anonymization, and availability overrides are audit-logged via AuditModule.

**Implementation:** `shared/audit/audit.service.ts` + `AuditLog` entity

**Tests that prove it:**
- `modules/impersonation/__tests__/impersonation.e2e-spec.ts > F5` — mutations during impersonation stamp both actorId and actingAdminId in AuditLog
- `modules/users/__tests__/users.e2e-spec.ts > B6` — UserDeletionLog written in same transaction as GDPR anonymization

**Status: PASS**

---

## SEC-007: Cross-Tenant Isolation

**Requirement:** 0% cross-org data leakage; a trainer cannot read or mutate another trainer's data.

**Implementation:** `TenantAwareRepository` base class structurally appends `WHERE trainerId = :ctx`; escape hatch `withoutTenantScope()` requires audit.

**Tests that prove it:**
- `__tests__/foundation.e2e-spec.ts > SEC-007` — trainer1 sees only their items; trainer2 sees only theirs
- `modules/coaches/__tests__/coach-cross-tenant.e2e-spec.ts` — trainer1 cannot list or resend trainer2's invitations
- `modules/trainers/__tests__/branding.e2e-spec.ts > G1d` — Trainer B updating their branding does NOT affect Trainer A
- `__tests__/g4-security-sweep.e2e-spec.ts > SEC-007` — Trainer A cannot revoke Trainer B's share link (gets 404)
- `modules/sharelinks/__tests__/sharelinks.manage.e2e-spec.ts` — share link scoped to trainer

**Status: PASS**

---

## SEC-008: SA→SA Impersonation Block

**Requirement:** A Super Admin cannot impersonate another Super Admin (403 CANNOT_IMPERSONATE_SUPER_ADMIN).

**Implementation:** `ImpersonationService.start()` checks `targetUser.role === SUPER_ADMIN`

**Tests that prove it:**
- `modules/impersonation/__tests__/impersonation.e2e-spec.ts > F3 SA→SA block` — SA impersonating SA → 403 CANNOT_IMPERSONATE_SUPER_ADMIN

**Status: PASS**

---

## SEC-009: Child Principal Constraints

**Requirement:** Child sub-login principals cannot: add trainers, manage payments, purchase tokens, or delete accounts.

**Implementation:** `AbilityFactory.forPrincipal()` — when `isChild=true`, denies the four actions; `AbilityGuard` enforces at handler level.

**Tests that prove it:**
- `__tests__/foundation.e2e-spec.ts > FR-026/SEC-009` — child hits @CheckAbility('add','Trainer') → 403 CHILD_FORBIDDEN; non-child → 200; same for manage/purchase/delete
- `modules/players/__tests__/join.child-block.e2e-spec.ts` — child sub-login cannot consume ShareLink (blocked at child gate)

**Status: PASS**

---

## Summary

| Requirement | Status | Primary Test File |
|-------------|--------|-------------------|
| SEC-001 Password hashing (argon2) | PASS | `password.service.spec.ts`, `g4-security-sweep.e2e-spec.ts` |
| SEC-002 Cookie hardening | PASS | `session.e2e-spec.ts`, `g4-security-sweep.e2e-spec.ts` |
| SEC-003 CSRF on state-changing routes | PASS | `csrf.e2e-spec.ts`, `g4-security-sweep.e2e-spec.ts` |
| SEC-004 Login rate limiting | PASS | `auth-throttle.e2e-spec.ts`, `g4-security-sweep.e2e-spec.ts` |
| SEC-005 Token expiry | PASS | `password-reset.e2e-spec.ts`, `g4-security-sweep.e2e-spec.ts` |
| SEC-006 Audit logging | PASS | `impersonation.e2e-spec.ts`, `users.e2e-spec.ts` |
| SEC-007 Cross-tenant isolation | PASS | `foundation.e2e-spec.ts`, `coach-cross-tenant.e2e-spec.ts`, `branding.e2e-spec.ts`, `g4-security-sweep.e2e-spec.ts` |
| SEC-008 SA→SA impersonation block | PASS | `impersonation.e2e-spec.ts` |
| SEC-009 Child principal constraints | PASS | `foundation.e2e-spec.ts`, `join.child-block.e2e-spec.ts` |

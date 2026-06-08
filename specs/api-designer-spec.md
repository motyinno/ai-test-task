# API Specification — Endpoints, Schemas, Authentication

> Living API specification. Read `MANIFEST.md` then `architect-architecture.md` first.
> Depends on: architect-architecture.md.

---

## Conventions (apply to all endpoints)

**Base path:** `/api/v1`

**Architecture:** Layered NestJS — Controllers delegate to Services (no CQRS command bus
for this project). DTOs validated with `class-validator`; responses serialized via
response DTOs (`class-transformer`, `@Exclude` on secrets).

**Resource IDs:** **UUID v4**, exposed publicly, validated with `ParseUUIDPipe`. No
sequential integers in URLs (anti-enumeration; consistent with opaque ShareLink tokens).

**Authentication:** Server-side session (Passport + express-session). Opaque session id in
an `httpOnly` + `Secure` + `SameSite` cookie. **No bearer tokens.** State-changing requests
require a **CSRF token** header (`X-CSRF-Token`). Swagger: `@ApiCookieAuth('session')`.

**Authorization:** `@Roles()` guard (role gate) + structural tenant filter (org isolation,
via CLS `TenantContext`) + CASL `@CheckAbility` for child sub-login constraints. Endpoints
list their required role(s) and any child-constraint.

**Active context:** Player/Parent requests act under the session's active context (which
profile + which trainer). Switching context is an explicit endpoint; it changes what
tenant-scoped reads return.

**Response shape:**
- Single resource → the DTO directly (bare body).
- Collections → paginated envelope:
  ```json
  { "data": [ /* items */ ],
    "meta": { "page": 1, "limit": 20, "total": 1234, "totalPages": 62 } }
  ```
- Mutations → the affected resource (or `204 No Content` for pure deletes).

**Pagination query (list endpoints):** `?page=1&limit=20` (`limit` max 100), plus
endpoint-specific `search` / filters. Page-based per the user-list AC (<3s for 10k users).

**Error shape (Nest-style):**
```json
{ "statusCode": 400, "message": "Validation failed", "error": "Bad Request",
  "errorCode": "VALIDATION_ERROR",
  "details": [ { "field": "email", "message": "Invalid email format" } ] }
```

**Common status codes:** 200 ok · 201 created · 204 no content · 400 validation ·
401 unauthenticated · 403 forbidden (role/tenant/child) · 404 not found ·
409 conflict (duplicate) · 410 gone (revoked/expired/used link) · 429 rate limited.

**Shared DTOs:**
```typescript
class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @IsOptional() @Type(() => Number)
  @IsInt() @Min(1) @Max(100) limit = 20;
}
class PageMetaDto { page: number; limit: number; total: number; totalPages: number; }
class PaginatedDto<T> { data: T[]; meta: PageMetaDto; }

enum UserRole { SUPER_ADMIN='SUPER_ADMIN', TRAINER='TRAINER', COACH='COACH', PLAYER='PLAYER' }
enum UserStatus { ACTIVE='ACTIVE', INACTIVE='INACTIVE', DELETED='DELETED' }
```

---

## [TASK-001] Auth API (2026-06-08)

**Module:** `modules/auth` · **Controller:** `AuthController` (`@ApiTags('auth')`,
`@Controller('auth')`) · Rate-limited via `@nestjs/throttler` (SEC-004).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/login` | public | Authenticate, create session |
| POST | `/auth/logout` | session | Destroy session |
| GET | `/auth/me` | session | Current principal + active context |
| POST | `/auth/first-login/change-password` | session (temp pw) | Force password change (FR-006) |
| POST | `/auth/password-reset` | public | Request reset email (1h link) |
| POST | `/auth/password-reset/confirm` | public | Set new password via token |
| POST | `/auth/verify-email` | public | Confirm email via token (non-blocking) |
| POST | `/auth/verify-email/resend` | session | Resend verification email |

**DTOs:**
```typescript
class LoginDto {
  @ApiProperty({ example: 'parent@example.com' }) @IsEmail() @MaxLength(255) email: string;
  @ApiProperty() @IsNotEmpty() password: string;
}
// Login also accepts child sub-login credentials (childUsername+password under parent) —
// resolved by the local strategy; same endpoint, principal type differs.

class MeResponseDto {
  @ApiProperty() id: string;            // user (or child principal) UUID
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty() isChild: boolean;
  @ApiPropertyOptional() parentUserId?: string;     // when child principal
  @ApiProperty() emailVerified: boolean;
  @ApiProperty() mustChangePassword: boolean;       // FR-006 gate
  @ApiPropertyOptional() impersonatedBy?: string;   // realAdminId when impersonating
  @ApiProperty({ type: () => ActiveContextDto }) activeContext: ActiveContextDto;
}
class ActiveContextDto {
  @ApiProperty() profileId: string;          // active "Me"/child PlayerProfile
  @ApiPropertyOptional() trainerId?: string; // active trainer association
  @ApiProperty() label: string;              // e.g. "Maya → Coach Bob"
}

class ChangePasswordDto {
  @ApiProperty() @IsNotEmpty() currentPassword: string;
  @ApiProperty({ minLength: 8 }) @IsStrongPassword() newPassword: string;
}
class RequestPasswordResetDto { @ApiProperty() @IsEmail() email: string; }
class ConfirmPasswordResetDto {
  @ApiProperty() @IsNotEmpty() token: string;
  @ApiProperty({ minLength: 8 }) @IsStrongPassword() newPassword: string;
}
class VerifyEmailDto { @ApiProperty() @IsNotEmpty() token: string; }
```

**Notes / status codes:**
- `POST /auth/login` → 200 `MeResponseDto` (sets cookie); 401 invalid creds; 403 account
  Inactive/Deleted (`ACCOUNT_DEACTIVATED`); 429 rate limited.
- `password-reset` always returns 204 (no account enumeration). Token expiry 1h (SEC-005).
- `verify-email` token expiry 24h; verification is **non-blocking** (login never gated).
- `change-password` required when `mustChangePassword` true; clears the temp-password flag.

---

## [TASK-001] Users API — Super Admin (2026-06-08)

**Module:** `modules/users` · `UsersController` (`@ApiTags('users')`, `@Controller('users')`)
· `@Roles(SUPER_ADMIN)` on all (system context — bypasses tenant filter via audited
escape hatch).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/users` | Global directory (paginated, tool-specific search/filter) |
| GET | `/users/:id` | Get one user |
| POST | `/users` | Create trainer account (FR-011) |
| PATCH | `/users/:id` | Edit user account/profile |
| POST | `/users/:id/deactivate` | Soft delete (FR-013) |
| POST | `/users/:id/reactivate` | Reactivate (rejected if anonymized) |
| DELETE | `/users/:id` | GDPR delete / anonymize (FR-014) |

**DTOs:**
```typescript
class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;   // name/email
  @ApiPropertyOptional({ enum: UserRole }) @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}

class CreateTrainerDto {                                  // POST /users (role fixed=TRAINER)
  @ApiProperty() @IsNotEmpty() @MaxLength(200) businessName: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) trainerName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsPhoneNumber() phone?: string;
  @ApiProperty({ enum: ['TEMP_PASSWORD','INVITE_LINK'], default: 'INVITE_LINK' })
  @IsEnum(['TEMP_PASSWORD','INVITE_LINK']) onboardingMode: 'TEMP_PASSWORD'|'INVITE_LINK';
}

class UpdateUserDto {            // partial; email/role read-only here
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsPhoneNumber() phone?: string;
  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}

class DeleteUserDto { @ApiProperty() @IsNotEmpty() reason: string; } // GDPR audit reason

class UserResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;          // anonymized value if deleted
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty({ enum: UserStatus }) status: UserStatus;
  @ApiProperty() displayName: string;    // "Deleted User" if anonymized
  @ApiProperty() emailVerified: boolean;
  @ApiPropertyOptional() anonymizedAt?: string;  // ISO; presence ⇒ irreversible
  @ApiPropertyOptional() lastLoginAt?: string;
  @ApiProperty() createdAt: string;
  @Exclude() passwordHash: string;
}
```

**Notes:**
- `POST /users` → 201; 409 `EMAIL_EXISTS` on duplicate (BR-001). Triggers invite/temp-pw
  email; records creator in audit log.
- `POST /:id/reactivate` → 200; **409 `USER_ANONYMIZED`** if `anonymizedAt != null` (D7 guard).
- `DELETE /:id` → 200 anonymized `UserResponseDto`; anonymizes PII + writes `UserDeletionLog`
  in one transaction; idempotent. 403 if target is another Super Admin (policy) — n/a here
  but deletion of SA restricted by policy.

---

## [TASK-001] Impersonation API (2026-06-08)

**Module:** `modules/impersonation` · `ImpersonationController`
(`@ApiTags('impersonation')`) · `@Roles(SUPER_ADMIN)`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/impersonation/:userId` | Begin impersonating user (FR-015) |
| POST | `/impersonation/exit` | End impersonation, restore admin |
| GET | `/impersonation/history` | Audit report (paginated) |

```typescript
class StartImpersonationResponseDto {
  @ApiProperty() impersonationLogId: string;
  @ApiProperty({ type: () => MeResponseDto }) actingAs: MeResponseDto;  // impersonated view
  @ApiProperty() expiresAt: string;   // start + 1h hard cap
}
class ImpersonationLogDto {
  @ApiProperty() id: string; @ApiProperty() adminId: string;
  @ApiProperty() impersonatedUserId: string;
  @ApiProperty() startAt: string; @ApiPropertyOptional() endAt?: string;
  @ApiPropertyOptional() durationSeconds?: number;
}
class ImpersonationHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() adminId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() impersonatedUserId?: string;
}
```

**Notes:**
- `POST /:userId` → 201; **403 `CANNOT_IMPERSONATE_SUPER_ADMIN`** (SEC-008). Opens
  `ImpersonationLog` bracket; session payload now carries the impersonation pair; 1h cap.
- `POST /exit` → 200; closes bracket (sets endAt/duration). Auto-closed server-side at 1h.
- All mutations while impersonating carry dual-actor attribution (D6).

---

## [TASK-001] Profile API — all roles (2026-06-08)

**Module:** `modules/profile` · `ProfileController` (`@ApiTags('profile')`,
`@Controller('me/profile')`) · session, any role.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me/profile` | Get own profile (role-specific fields) |
| PATCH | `/me/profile` | Update own profile |
| POST | `/me/profile/photo` | Upload photo (multipart) → thumbnail (FR-061) |

```typescript
class UpdateProfileDto {                 // email & role read-only (omitted)
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsPhoneNumber() phone?: string;
  // role-specific (validated by role):
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) school?: string;       // player
  @ApiPropertyOptional() @IsOptional() jerseyNumber?: string;                 // player
  @ApiPropertyOptional() @IsOptional() @MaxLength(2000) bio?: string;         // coach
  @ApiPropertyOptional() @IsOptional() credentials?: string;                  // coach
  @ApiPropertyOptional() @IsOptional() @IsBoolean() publicProfile?: boolean;  // coach
  @ApiPropertyOptional() @IsOptional() emergencyContact?: string;             // parent
}
class ProfileResponseDto { /* id, role, common + role-specific fields, photoUrl, readOnly{email,role,createdAt} */ }
```
`POST /me/profile/photo`: `@ApiConsumes('multipart/form-data')`, PNG/JPG ≤ (profile) limit;
returns `{ photoUrl, thumbnailUrl }`. 400 on type/size.

---

## [TASK-001] Trainers API (2026-06-08)

**Module:** `modules/trainers` · `TrainersController` (`@ApiTags('trainers')`) ·
`@Roles(TRAINER)` for `me/*` (tenant-scoped to caller's org); SA via Users API for creation.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/trainers/me/players` | Own org players (paginated, availability summary) |
| GET | `/trainers/me/coaches` | Own org coaches |
| GET | `/trainers/me/players/availability` | Player availability view + filter (FR-051) |
| PUT | `/trainers/me/branding` | Portal branding (FR-054) |
| GET | `/trainers/me/branding` | Read current branding |

```typescript
class PlayerAvailabilityQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['MON','TUE','WED','THU','FRI','SAT','SUN'] })
  @IsOptional() day?: string;
  @ApiPropertyOptional({ example: '17:00' }) @IsOptional() fromTime?: string;
  @ApiPropertyOptional({ example: '20:00' }) @IsOptional() toTime?: string;
}
class UpdateBrandingDto {
  @ApiPropertyOptional({ description: 'logo upload via separate multipart or pre-uploaded URL' })
  @IsOptional() @IsUrl() logoUrl?: string;
  @ApiProperty({ example: '#1E88E5' }) @Matches(/^#[0-9A-Fa-f]{6}$/) primaryColorHex: string;
}
// Logo upload: POST /trainers/me/branding/logo (multipart, PNG/JPG/SVG ≤2MB) → { logoUrl }
class BrandingResponseDto { logoUrl?: string; primaryColorHex: string; }
```

---

## [TASK-001] Coaches API (2026-06-08)

**Module:** `modules/coaches` · `CoachesController` (`@ApiTags('coaches')`).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/coaches/invite` | TRAINER | Invite coach → unique ShareLink + email (FR-040) |
| GET | `/coaches` | TRAINER | Own org coaches (status) |
| GET | `/coaches/invitations` | TRAINER | Invitation statuses (Pending/Accepted/Expired) |
| POST | `/coaches/invitations/:id/resend` | TRAINER | Resend/refresh unique link (edge A) |
| GET | `/coaches/me/availability` | COACH | My Times |
| PUT | `/coaches/me/availability` | COACH | Set My Times (FR-042) |
| PUT | `/coaches/me/profile` | COACH | Public profile (bio/credentials/visibility) |

```typescript
class InviteCoachDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(500) message?: string;
}
class CoachInvitationDto {
  @ApiProperty() id: string; @ApiProperty() email: string;
  @ApiProperty({ enum: ['PENDING','ACCEPTED','EXPIRED'] }) status: string;
  @ApiProperty() shareLinkCode: string; @ApiProperty() expiresAt: string;
}
class AvailabilitySlotDto {
  @ApiProperty({ enum: ['MON','TUE','WED','THU','FRI','SAT','SUN'] }) dayOfWeek: string;
  @ApiProperty({ example: '16:00' }) @Matches(/^\d{2}:\d{2}$/) startTime: string;
  @ApiProperty({ example: '20:00' }) @Matches(/^\d{2}:\d{2}$/) endTime: string;
}
class SetAvailabilityDto {
  @ApiProperty({ type: [AvailabilitySlotDto] }) @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto) slots: AvailabilitySlotDto[];
}
```

**Notes:** `POST /coaches/invite` → 201; 409 `COACH_ALREADY_ACTIVE_ELSEWHERE` if email maps
to a coach active under another trainer (BR-006). Acceptance happens via `/join/:code`
(ShareLinks). Conflict-override on event assignment is **Epic-02** (event domain); the
override-logging contract is referenced there.

---

## [TASK-001] Players / Family API (2026-06-08)

**Module:** `modules/players` + `modules/child-account` · `PlayersController`
(`@ApiTags('players')`). Player/Parent role; actions scoped to active context.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/sharelinks/:code/validate` | public | Preview link (advisory) before register |
| POST | `/join/:code` | public/session | Register or associate via ShareLink (FR-020) |
| GET | `/players/me/children` | PLAYER(parent) | List children + trainer associations |
| POST | `/players/me/children` | PLAYER(parent) | Create child profile (FR-023) |
| GET | `/players/me/contexts` | PLAYER | Context switcher list (Me + children × trainers) |
| POST | `/players/me/context` | PLAYER | Switch active context (FR-025) |
| POST | `/players/me/children/:childId/trainers` | PLAYER(parent) | Add child↔trainer (FR-024) |
| DELETE | `/players/me/children/:childId/trainers/:trainerId` | PLAYER(parent) | Remove child↔trainer |
| GET | `/players/:profileId/availability` | PLAYER | Get Best Times (own/child) |
| PUT | `/players/:profileId/availability` | PLAYER | Set Best Times (FR-030) |
| PATCH | `/players/me/children/:childId/token-setting` | PLAYER(parent) | Toggle token approval (FR-029) |

```typescript
class JoinViaLinkDto {                 // anonymous registration; omitted when logged in
  @ApiProperty() @IsNotEmpty() name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ minLength: 8 }) @IsStrongPassword() password: string;
  @ApiPropertyOptional() @IsOptional() @IsPhoneNumber() phone?: string;
  // when registering as/with a player:
  @ApiPropertyOptional() @IsOptional() playerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(18) age?: number;
  @ApiPropertyOptional({ enum: ['MALE','FEMALE','OTHER'] }) @IsOptional() gender?: string;
  // multi-trainer parent w/ children: which family members to associate (FR-021)
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsUUID('4',{each:true})
  associateProfileIds?: string[];
}
class ShareLinkPreviewDto {
  @ApiProperty() valid: boolean;
  @ApiProperty({ enum: ['STATIC','UNIQUE'] }) type: string;
  @ApiProperty() trainerName: string;
  @ApiPropertyOptional() reason?: string;   // when invalid: revoked/expired/used
}
class CreateChildDto {
  @ApiProperty() @IsNotEmpty() @MaxLength(100) name: string;
  @ApiProperty({ minimum: 1, maximum: 18 }) @IsInt() @Min(1) @Max(18) age: number;  // BR-017
  @ApiProperty({ enum: ['MALE','FEMALE','OTHER'] }) @IsEnum(['MALE','FEMALE','OTHER']) gender: string;
  @ApiPropertyOptional() @IsOptional() school?: string;
  @ApiPropertyOptional({ type: [String], description: 'trainerIds to associate now' })
  @IsOptional() @IsUUID('4',{each:true}) trainerIds?: string[];
  @ApiPropertyOptional({ description: 'create a constrained child sub-login' })
  @IsOptional() @IsBoolean() createLogin?: boolean;
}
class AddChildTrainerDto {              // Option A code OR Option B existing trainer
  @ApiPropertyOptional() @IsOptional() shareLinkCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() trainerId?: string;
}
class SwitchContextDto {
  @ApiProperty() @IsUUID() profileId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() trainerId?: string;
}
class TokenSettingDto { @ApiProperty() @IsBoolean() allowTokenSpendWithoutApproval: boolean; }
class ContextDto { profileId: string; profileName: string; trainerId: string; trainerName: string; isSelf: boolean; }
```

**Notes:**
- `GET /sharelinks/:code/validate` advisory only; never trusted for the write.
- `POST /join/:code`: anonymous → 201 (create User+PlayerProfile+association); logged-in
  player → 200/201 new association only (BR-005); existing active association → 200 no-op
  (`ALREADY_ASSOCIATED`). 410 for revoked/expired/used link. **If child principal → 403
  `CHILD_SHARELINK_BLOCKED`** and parent emailed (FR-027).
- `DELETE …/trainers/:trainerId` → 200; cancels upcoming RSVPs, soft-deletes child's data
  with that trainer (history preserved).
- Child sub-login constraints enforced by CASL `@CheckAbility` — add-trainer / payment /
  purchase / delete return 403 `CHILD_FORBIDDEN`.

---

## [TASK-001] ShareLinks API (2026-06-08)

**Module:** `modules/sharelinks` · `ShareLinksController` (`@ApiTags('sharelinks')`) ·
`@Roles(TRAINER)` for management; validate is public.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/sharelinks` | TRAINER | Generate static (player) or unique (coach) link |
| GET | `/sharelinks` | TRAINER | List own links + usage analytics |
| POST | `/sharelinks/:id/revoke` | TRAINER | Revoke (flip active=false) |
| GET | `/sharelinks/:code/validate` | public | (shared with Players API) preview |

```typescript
class CreateShareLinkDto {
  @ApiProperty({ enum: ['STATIC','UNIQUE'] }) @IsEnum(['STATIC','UNIQUE']) type: 'STATIC'|'UNIQUE';
  @ApiPropertyOptional({ description: 'required for UNIQUE (coach) links' })
  @ValidateIf(o => o.type === 'UNIQUE') @IsEmail() targetEmail?: string;
}
class ShareLinkDto {
  @ApiProperty() id: string; @ApiProperty() code: string;       // opaque random token
  @ApiProperty() url: string;                                   // /join/:code
  @ApiProperty({ enum: ['STATIC','UNIQUE'] }) type: string;
  @ApiPropertyOptional() targetEmail?: string;
  @ApiPropertyOptional() expiresAt?: string;   // null for static
  @ApiProperty() useCount: number; @ApiPropertyOptional() maxUses?: number;
  @ApiProperty() active: boolean;
}
```
**Notes:** STATIC → unlimited, no expiry (BR-013). UNIQUE → maxUses=1, expiresAt=+7d
(BR-014). Consumption (unique) is an atomic check-and-increment inside the registration
transaction (edge E). Static usage increment is best-effort/async (analytics only).

---

## [TASK-001] Approvals API (2026-06-08)

**Module:** `modules/approvals` · `ApprovalsController` (`@ApiTags('approvals')`).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/approvals` | PLAYER(parent) | Parent's approval queue (paginated, filter status) |
| GET | `/approvals/:id` | PLAYER(parent) | One request |
| POST | `/approvals/:id/approve` | PLAYER(parent) | Approve → process payment/register (FR-028) |
| POST | `/approvals/:id/deny` | PLAYER(parent) | Deny |

```typescript
enum PaymentType { USD='USD', TOKEN='TOKEN' }
enum ApprovalStatus { PENDING='PENDING', APPROVED='APPROVED', DENIED='DENIED', EXPIRED='EXPIRED', CANCELLED='CANCELLED' }

class ListApprovalsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ApprovalStatus }) @IsOptional() @IsEnum(ApprovalStatus) status?: ApprovalStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() childProfileId?: string;
}
class ResolveApprovalDto { @ApiPropertyOptional() @IsOptional() @MaxLength(500) parentNotes?: string; }
class ApprovalRequestDto {
  @ApiProperty() id: string; @ApiProperty() childProfileId: string;
  @ApiProperty() childName: string; @ApiProperty() eventRef: string;
  @ApiProperty() amount: number; @ApiProperty({ enum: PaymentType }) paymentType: PaymentType;
  @ApiProperty({ enum: ApprovalStatus }) status: ApprovalStatus;
  @ApiProperty() autoApproved: boolean;
  @ApiPropertyOptional() expiresAt?: string;     // null when autoApproved
  @ApiPropertyOptional() resolvedAt?: string; @ApiPropertyOptional() parentNotes?: string;
  @ApiProperty() createdAt: string;
}
```

**Notes:**
- ApprovalRequest rows are **created server-side** by the checkout/RSVP flow (Epic-02/05
  integration), not by a public POST. USD always creates a Pending request (BR-008); TOKEN
  with per-child flag ON → instant + auto-approved informational record (no 48h timer).
- `approve`/`deny` → 200; **409 `APPROVAL_NOT_PENDING`** if already terminal (race-safe).
- 48h auto-deny via scheduler → `EXPIRED` (in-process cron + Postgres advisory lock).

---

## Endpoint Index (TASK-001 summary)

| Domain | # endpoints | Key auth |
|--------|-------------|----------|
| Auth | 8 | public + session, rate-limited |
| Users (SA) | 7 | SUPER_ADMIN, system context |
| Impersonation | 3 | SUPER_ADMIN, SA→SA blocked |
| Profile | 3 | session, any role |
| Trainers | 5 | TRAINER, tenant-scoped |
| Coaches | 7 | TRAINER + COACH |
| Players/Family | 11 | PLAYER + public join, CASL child constraints |
| ShareLinks | 4 | TRAINER + public validate |
| Approvals | 4 | PLAYER(parent) |

**Cross-epic references:** coach event-assignment conflict override (Epic-02);
ApprovalRequest creation on checkout + payment processing (Epic-02/05); ShareLink usage
analytics consumption (Epic-06); Camp-to-User pre-fill (Epic-08).

**Open gaps affecting DTOs:** skill-level enum (Q-01.01), age-group model (Q-01.02),
full email list (Q-01.04), coach-override notification (Q-01.06), Epic-05 payment field
ownership (TrainerProfile Stripe/subscription fields).

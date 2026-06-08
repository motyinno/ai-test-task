# Phase C — ShareLinks & Invitations Implementation Plan

**Task:** TASK-001 (Epic-01) · **Phase:** C · expands the Phase C index from `writing-plans-plan.md`.

> **For Claude:** Per the per-phase PR workflow, implement on a NEW branch
> `task-001/phase-c-sharelinks` created off `master` **after PR #2 (Phase B) is merged**
> (Phase C depends on Phase A foundation + Phase B profile entities). Use the `coder` skill.

**Goal:** Build the ShareLink invitation system — trainers generate static (player) and unique
(coach) links; visitors register/associate via `/join/:code`; with all edge cases (expired/used
resend, no-duplicate association, revoked, child-block, single-use race) handled.

**Architecture:** Layered NestJS (Controller → Service → Repository). ShareLink is the
unforgeable credential: an **opaque random CSPRNG token**, with the **DB row as the single
source of truth** (D4). Trainer-facing management (create/list/revoke) is **tenant-scoped**
via `TenantAwareRepository`; the **public validate/join by `code` is a GLOBAL lookup** (the
visitor has no trainer context yet — the code itself is the credential), performed through the
**audited `withoutTenantScope()`** escape hatch. Unique-link consumption is an **atomic
check-and-increment in one transaction** with the association write (edge E).

**Tech Stack:** NestJS · TypeORM · PostgreSQL · `crypto` (CSPRNG) · argon2 (Phase A) ·
`nestjs-cls` tenancy (Phase A) · Jest. Test DB: docker Postgres `:5433`.

**Source specs:** `brainstorming-design.md` §Q5/Q5b/D4, `specs/api-designer-spec.md`
(ShareLinks API + Players/Family API + Coaches API), `specs/architect-architecture.md`
(A1 tenancy, transaction boundaries).

**Conventions (locked — do not deviate):** UUID v4 PKs (`ParseUUIDPipe`); `{data,meta}` list
envelope; Nest error shape with **exact errorCodes** (below); session+CSRF auth (no JWT);
`/api/v1` base; argon2; `class-validator` DTOs; single migration source
(`shared/database/run-migrations.mjs` + a real TypeORM migration); genuine tests (NO
`expect(true)` — failing-first for every security-critical path); commit per green task.

**Test commands:**
- Targeted: `NODE_ENV=test npx nx test api --skip-nx-cache --maxWorkers=1 -t "<describe/it name>"`
- Full gate: `NODE_ENV=test npx nx test api --skip-nx-cache --maxWorkers=1`
- Build: `npx nx build api`

**Error codes used in this phase:** `LINK_NOT_FOUND` (404), `LINK_REVOKED` (410),
`LINK_EXPIRED` (410), `LINK_USED` (410), `CHILD_SHARELINK_BLOCKED` (403),
`ALREADY_ASSOCIATED` (200 no-op body), `COACH_ALREADY_ACTIVE_ELSEWHERE` (409),
`EMAIL_EXISTS` (409, reuse Phase B).

---

## Dependency note (read before starting)

- `TrainerPlayerAssociation` is needed by the join flow (C6 below) — it is created **in this
  phase**, not deferred to Phase D. Phase D will later extend `PlayerProfile` child fields and
  reuse this association entity. Flag this overlap in the Phase D plan when you reach it.
- The session principal already carries `isChild` (Phase A `SessionContextService`), so the
  child-block gate (C10) is implementable and testable now even though child sub-login
  *creation* lands in Phase D — test it by seeding a session with `isChild=true`.
- `ShareLink`, `TrainerPlayerAssociation`, `CoachProfile` are **org-bound** (carry `trainerId`)
  → trainer-facing queries MUST go through `TenantAwareRepository`. The public `code` lookup is
  the documented exception (global, via `withoutTenantScope()` with an audit comment).

---

## Tasks

### Task C1: `ShareLink` entity + migration

**Files:**
- Create: `backend/apps/api/src/modules/sharelinks/entities/share-link.entity.ts`
- Modify: `backend/apps/api/src/shared/database/migrations/<ts>-PhaseCShareLinks.ts` (new) and
  `backend/apps/api/src/shared/database/run-migrations.mjs` (register it — single source)
- Test: `backend/apps/api/src/modules/sharelinks/entities/__tests__/share-link.entity.spec.ts`

**Step 1: Write the failing test**
```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShareLink, ShareLinkType } from '../share-link.entity';
import { TestDbModule } from '../../../../shared/database/test-db.module'; // existing test helper

describe('ShareLink entity', () => {
  let repo: Repository<ShareLink>;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [TestDbModule([ShareLink])] }).compile();
    repo = mod.get(getRepositoryToken(ShareLink));
  });
  it('persists a static link with defaults', async () => {
    const link = await repo.save(repo.create({
      code: 'code-c1-static', type: ShareLinkType.STATIC,
      trainerId: 'trainer-1', createdBy: 'trainer-1',
    }));
    expect(link.id).toMatch(/[0-9a-f-]{36}/);
    expect(link.active).toBe(true);
    expect(link.useCount).toBe(0);
    expect(link.expiresAt).toBeNull();
    expect(link.maxUses).toBeNull();
  });
  it('enforces unique code', async () => {
    await repo.save(repo.create({ code: 'dup-c1', type: ShareLinkType.STATIC, trainerId: 't', createdBy: 't' }));
    await expect(
      repo.save(repo.create({ code: 'dup-c1', type: ShareLinkType.STATIC, trainerId: 't', createdBy: 't' })),
    ).rejects.toThrow();
  });
});
```

**Step 2: Run → FAIL** (`Cannot find module '../share-link.entity'`).
Run: `NODE_ENV=test npx nx test api --skip-nx-cache --maxWorkers=1 -t "ShareLink entity"`

**Step 3: Implement entity**
```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum ShareLinkType { STATIC = 'STATIC', UNIQUE = 'UNIQUE' }

@Entity('share_links')
@Index('IDX_share_links_trainer_id', ['trainerId'])
export class ShareLink {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ unique: true }) code!: string;                 // opaque random token (C2)

  @Column({ type: 'enum', enum: ShareLinkType }) type!: ShareLinkType;

  @Column({ name: 'trainer_id' }) trainerId!: string;      // org-bound
  @Column({ name: 'created_by' }) createdBy!: string;

  @Column({ name: 'target_email', nullable: true, default: null })
  targetEmail: string | null = null;                       // required for UNIQUE (coach)

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true, default: null })
  expiresAt: Date | null = null;                           // null for STATIC

  @Column({ name: 'max_uses', type: 'int', nullable: true, default: null })
  maxUses: number | null = null;                           // 1 for UNIQUE, null for STATIC

  @Column({ name: 'use_count', type: 'int', default: 0 }) useCount!: number;
  @Column({ default: true }) active!: boolean;             // revoke = flip false

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
```
Author the TypeORM migration (`share_links` table, unique index on `code`, index on
`trainer_id`, enum type) and register it in the consolidated `run-migrations.mjs`.

**Step 4: Run → PASS.** Also run the migration on a fresh DB to confirm.

**Step 5: Commit**
```bash
git add backend/apps/api/src/modules/sharelinks backend/apps/api/src/shared/database
git commit -m "feat(sharelinks/C1): ShareLink entity + migration (opaque code, D4)"
```

---

### Task C2: Opaque CSPRNG code generator

**Files:**
- Create: `backend/apps/api/src/modules/sharelinks/share-link-code.util.ts`
- Test: `backend/apps/api/src/modules/sharelinks/__tests__/share-link-code.util.spec.ts`

**Step 1: Write the failing test**
```typescript
import { generateShareLinkCode } from '../share-link-code.util';
describe('generateShareLinkCode', () => {
  it('produces a URL-safe high-entropy token', () => {
    const code = generateShareLinkCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);     // base64url, no padding
    expect(code.length).toBeGreaterThanOrEqual(32);
  });
  it('is collision-resistant across many calls', () => {
    const set = new Set(Array.from({ length: 5000 }, () => generateShareLinkCode()));
    expect(set.size).toBe(5000);
  });
});
```

**Step 2: Run → FAIL.**

**Step 3: Implement**
```typescript
import { randomBytes } from 'crypto';
/** Opaque, unsigned, ~256-bit URL-safe token. DB row is source of truth (D4). */
export function generateShareLinkCode(): string {
  return randomBytes(32).toString('base64url');
}
```

**Step 4: Run → PASS.**

**Step 5: Commit** `feat(sharelinks/C2): CSPRNG opaque code generator`

---

### Task C3: `ShareLinkService.generateStatic/generateUnique` + `POST /sharelinks`

**Files:**
- Create: `sharelinks/sharelinks.repository.ts`, `sharelinks.service.ts`, `sharelinks.controller.ts`,
  `sharelinks.module.ts`, `dto/create-share-link.dto.ts`, `dto/share-link-response.dto.ts`
- Modify: `app/app.module.ts` (register `ShareLinksModule`)
- Test: `sharelinks/__tests__/sharelinks.create.e2e-spec.ts`

**Step 1: Write the failing test** (e2e, trainer session):
- `POST /api/v1/sharelinks` `{ type: 'STATIC' }` as TRAINER → 201; body has `code`, `url`
  (`/join/:code`), `type=STATIC`, `expiresAt=null`, `maxUses=null`, `active=true`,
  `trainerId` = caller's trainer.
- `POST /sharelinks` `{ type: 'UNIQUE', targetEmail: 'c@x.com' }` → 201; `maxUses=1`,
  `expiresAt` ≈ now+7d.
- `POST /sharelinks` `{ type: 'UNIQUE' }` (no targetEmail) → 400 validation.
- `POST /sharelinks` as a non-trainer (PLAYER) → 403.

**Step 2: Run → FAIL.**

**Step 3: Implement.**
DTO:
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsEmail, ValidateIf } from 'class-validator';
import { ShareLinkType } from '../entities/share-link.entity';
export class CreateShareLinkDto {
  @ApiProperty({ enum: ShareLinkType }) @IsEnum(ShareLinkType) type!: ShareLinkType;
  @ApiPropertyOptional() @ValidateIf((o) => o.type === ShareLinkType.UNIQUE) @IsEmail()
  targetEmail?: string;
}
```
Service (tenant-scoped repo for writes — trainer creating in their own org):
```typescript
async generate(dto: CreateShareLinkDto, ctx: { trainerId: string; userId: string }) {
  const base = { code: generateShareLinkCode(), trainerId: ctx.trainerId, createdBy: ctx.userId };
  const entity = dto.type === ShareLinkType.UNIQUE
    ? { ...base, type: ShareLinkType.UNIQUE, targetEmail: dto.targetEmail!, maxUses: 1,
        expiresAt: this.sevenDaysFromNow() }
    : { ...base, type: ShareLinkType.STATIC, maxUses: null, expiresAt: null };
  return this.repo.createScoped(entity);   // TenantAwareRepository scoped write
}
```
Controller: `@Roles('TRAINER')`, `@Post('sharelinks')`, returns `ShareLinkResponseDto`
(maps entity → adds `url`). Use `sevenDaysFromNow` as a pure helper (inject a clock if you
want it testable, else `new Date(Date.now()+7*864e5)`).

**Step 4: Run → PASS.**

**Step 5: Commit** `feat(sharelinks/C3): generate static/unique links via POST /sharelinks`

---

### Task C4: `GET /sharelinks` (list) + `POST /sharelinks/:id/revoke`

**Files:** modify `sharelinks.controller.ts`, `sharelinks.service.ts`, `sharelinks.repository.ts`;
Test: `sharelinks/__tests__/sharelinks.manage.e2e-spec.ts`

**Step 1: Write the failing test:**
- `GET /sharelinks?page=1&limit=20` as TRAINER → 200 `{data,meta}`; returns ONLY caller-org
  links (seed a second trainer's link, assert it is NOT present — **tenant isolation**,
  failing-first sanity: removing the scope must surface the other trainer's link).
- `POST /sharelinks/:id/revoke` → 200, `active=false`; revoking another trainer's link → 404
  (tenant-scoped, not found).

**Step 2: Run → FAIL.**

**Step 3: Implement** list via `TenantAwareRepository.scopedFindAndCount` (paginated) and
revoke via scoped update flipping `active=false`. Map to `{data,meta}`.

**Step 4: Run → PASS** (incl. the isolation sanity check).

**Step 5: Commit** `feat(sharelinks/C4): list + revoke share links (tenant-scoped)`

---

### Task C5: Validation pipeline + `GET /sharelinks/:code/validate` (public, global lookup)

**Files:** create `sharelinks/share-link-validator.service.ts`, `dto/share-link-preview.dto.ts`;
modify controller; Test: `sharelinks/__tests__/sharelinks.validate.e2e-spec.ts`

**Step 1: Write the failing test** (public, no session) covering gate steps 1–4:
- unknown code → 404 `LINK_NOT_FOUND`.
- revoked (`active=false`) → 410 `LINK_REVOKED`.
- expired unique link → 410 `LINK_EXPIRED`.
- used unique link (`useCount>=maxUses`) → 410 `LINK_USED`.
- valid static link → 200 `{ valid:true, type:'STATIC', trainerName }`.

**Step 2: Run → FAIL.**

**Step 3: Implement** the ordered gate. **Key nuance:** the lookup by `code` is GLOBAL — the
visitor has no tenant context — so resolve the row via the audited escape hatch:
```typescript
async resolve(code: string): Promise<ShareLink> {
  // GLOBAL lookup: the code is the credential; visitor has no trainer context.
  const link = await this.repo.withoutTenantScope(() =>           // audited escape hatch (A1)
    this.repo.baseFindOne({ where: { code } }));
  if (!link) throw new NotFoundException({ errorCode: 'LINK_NOT_FOUND', message: 'Invalid link' });
  if (!link.active) throw new GoneException({ errorCode: 'LINK_REVOKED', message: 'Link revoked' });
  if (link.expiresAt && link.expiresAt < new Date())
    throw new GoneException({ errorCode: 'LINK_EXPIRED', message: 'Link expired' });
  if (link.type === ShareLinkType.UNIQUE && link.maxUses != null && link.useCount >= link.maxUses)
    throw new GoneException({ errorCode: 'LINK_USED', message: 'Link already used' });
  return link;
}
```
`GET /sharelinks/:code/validate` is **public** (mark with the project's `@Public()` decorator /
no `@Roles`) and returns `ShareLinkPreviewDto` (advisory; never trusted for the write — the
join flow re-runs `resolve`). Look up `trainerName` from the trainer profile for display.

> Note: ensure the global `RolesGuard`/`AbilityGuard` allow public routes (Phase A pattern).
> If a `@Public()` decorator doesn't exist yet, add a minimal one + guard check here.

**Step 4: Run → PASS.**

**Step 5: Commit** `feat(sharelinks/C5): validation pipeline + public validate endpoint`

---

### Task C6: `TrainerPlayerAssociation` entity + migration (unique constraint)

**Files:** create `modules/players/entities/trainer-player-association.entity.ts`; new migration
+ register in `run-migrations.mjs`; Test:
`modules/players/entities/__tests__/trainer-player-association.entity.spec.ts`

**Step 1: Write the failing test:**
- persists with `status=ACTIVE` default, `viaShareLinkId`, `connectedAt`.
- **unique `(trainerId, playerProfileId)`** — inserting a second active row for the same pair
  throws (BR-005 race-safety at the DB level).

**Step 2: Run → FAIL.**

**Step 3: Implement**
```typescript
export enum AssociationStatus { ACTIVE = 'ACTIVE', REMOVED = 'REMOVED' }

@Entity('trainer_player_associations')
@Unique('UQ_trainer_player', ['trainerId', 'playerProfileId'])
@Index('IDX_tpa_trainer_id', ['trainerId'])
export class TrainerPlayerAssociation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'trainer_id' }) trainerId!: string;        // org-bound
  @Column({ name: 'player_profile_id' }) playerProfileId!: string;
  @Column({ name: 'via_share_link_id', nullable: true, default: null })
  viaShareLinkId: string | null = null;
  @Column({ type: 'enum', enum: AssociationStatus, default: AssociationStatus.ACTIVE })
  status!: AssociationStatus;
  @CreateDateColumn({ name: 'connected_at' }) connectedAt!: Date;
}
```
Migration with the unique constraint + index.

**Step 4: Run → PASS** + migrate fresh DB.

**Step 5: Commit** `feat(players/C6): TrainerPlayerAssociation entity + unique constraint (BR-005)`

---

### Task C7: `POST /join/:code` — new (anonymous) player registration [static link]

**Files:** create `modules/players/players.controller.ts`, `players.service.ts`,
`players.repository.ts`, `players.module.ts`, `dto/join-via-link.dto.ts`; Test:
`modules/players/__tests__/join.register.e2e-spec.ts`

**Step 1: Write the failing test** (no session, static link):
- `POST /api/v1/join/:code` with `{ name, email, password, playerName, age, gender }` →
  201; creates `User` (role PLAYER, argon2 hash), `PlayerProfile`, and a
  `TrainerPlayerAssociation` to the link's trainer; sets a session cookie (logged in).
- duplicate email → 409 `EMAIL_EXISTS`.
- the whole create is atomic (simulate association failure → no orphan User).

**Step 2: Run → FAIL.**

**Step 3: Implement.** DTO per api-spec `JoinViaLinkDto`. Service: re-`resolve(code)` (never
trust the preview), branch on principal: anonymous → create in ONE transaction
(`dataSource.transaction`): User + PlayerProfile + association (link's `trainerId`,
`viaShareLinkId=link.id`). Hash password with Phase A `PasswordService`. Establish the
session (reuse Phase A `SessionContextService`/login path).

**Step 4: Run → PASS.**

**Step 5: Commit** `feat(players/C7): join via static link — new player registration`

---

### Task C8: `POST /join/:code` — existing logged-in player association (BR-005 / edge B)

**Files:** modify `players.service.ts`; Test: `modules/players/__tests__/join.associate.e2e-spec.ts`

**Step 1: Write the failing test** (logged-in PLAYER session):
- existing player clicks a DIFFERENT trainer's static link → 200/201; creates ONLY a new
  `TrainerPlayerAssociation` (no new User/PlayerProfile — BR-005).
- clicking a link for an already-ACTIVE association → 200 `ALREADY_ASSOCIATED` no-op (no
  second row).
- clicking a link for a previously-REMOVED association → **reactivates** the existing row
  (status REMOVED→ACTIVE), does NOT insert a duplicate.
- **failing-first sanity:** without the duplicate guard, a second row insert must violate the
  unique constraint — assert the service handles the constraint as "already associated"
  (read-after-conflict), never a 500.

**Step 2: Run → FAIL.**

**Step 3: Implement** the logged-in branch: look up existing association `(trainerId,
playerProfileId)`; ACTIVE → no-op; REMOVED → reactivate; none → insert. Catch the unique
violation and resolve to the already-associated outcome (race-safe).

**Step 4: Run → PASS.**

**Step 5: Commit** `feat(players/C8): existing-player association, no-duplicate (BR-005, edge B)`

---

### Task C9: Edge E — atomic single-use consume for UNIQUE links

**Files:** modify `sharelinks.repository.ts` (consume method), `players.service.ts`
(coach/player consume), Test: `sharelinks/__tests__/sharelinks.consume-race.e2e-spec.ts`

**Step 1: Write the failing test:**
- two concurrent `POST /join/:code` on the SAME unique link → **exactly one** succeeds (201);
  the other gets 410 `LINK_USED`. After, `useCount===1`.
- consume happens in the SAME transaction as the association; if association fails, the use is
  released (rolled back) — assert `useCount` stays 0 on a forced association failure.
- static link: `useCount` increments for analytics but is **not** consumption-limited and does
  not block concurrent joins (best-effort/async; never fails the join).

**Step 2: Run → FAIL.**

**Step 3: Implement** the atomic check-and-increment as a single conditional UPDATE inside the
join transaction (D4 edge E):
```typescript
// returns 1 row iff the link was still consumable; runs inside the join tx (QueryRunner em)
async consumeUnique(em: EntityManager, code: string): Promise<boolean> {
  const res = await em.createQueryBuilder()
    .update(ShareLink)
    .set({ useCount: () => 'use_count + 1' })
    .where('code = :code AND active = true AND (expires_at IS NULL OR expires_at > now()) ' +
           'AND use_count < max_uses', { code })
    .returning('id')
    .execute();
  return (res.affected ?? 0) === 1;   // false ⇒ caller throws LINK_USED
}
```
For STATIC links, increment `useCount` best-effort AFTER commit (fire-and-forget, catch-and-log)
so analytics never blocks/fails the hot path (NFR-004). Simulate concurrency in the test with
`Promise.all([join(), join()])`.

**Step 4: Run → PASS.** (Sanity: temporarily drop the `use_count < max_uses` predicate → both
joins succeed → test goes red. Restore.)

**Step 5: Commit** `feat(sharelinks/C9): atomic single-use consume for unique links (edge E)`

---

### Task C10: Edge D — child-principal block + parent email (FR-027)

**Files:** modify `players.service.ts` / `share-link-validator.service.ts` (gate step 5);
Test: `modules/players/__tests__/join.child-block.e2e-spec.ts`

**Step 1: Write the failing test** (session with `isChild=true`, parentUserId set — seed via
the Phase A session test helper):
- child principal `POST /join/:code` → **403 `CHILD_SHARELINK_BLOCKED`**; NO association
  created; NO account mutation.
- a parent-notification email is dispatched to the child's `parentUserId` (assert via the
  EmailService dev adapter's recorded messages — contains the trainer/link context + a
  registration CTA).
- **failing-first sanity:** without the gate, the child would get associated — assert the gate
  genuinely blocks (removing it makes the test red).

**Step 2: Run → FAIL.**

**Step 3: Implement** gate step 5 in `resolve`/join: if `principal?.isChild` → send parent
email (best-effort) and throw `ForbiddenException({ errorCode: 'CHILD_SHARELINK_BLOCKED' })`
before any association. Log for audit.

> Note: child sub-login *creation* is Phase D; here we only enforce the BLOCK behavior using the
> `isChild` session flag (Phase A). Leave a comment pointing to Phase D for full child auth.

**Step 4: Run → PASS.**

**Step 5: Commit** `feat(players/C10): block child sharelink + notify parent (FR-027, edge D)`

---

### Task C11: Coach invite + acceptance (single-trainer guard, BR-006)

**Files:** modify `modules/coaches/coaches.controller.ts`, `coaches.service.ts` (Phase B exists);
create `coaches/dto/invite-coach.dto.ts`; extend join flow for UNIQUE (coach) links;
Test: `modules/coaches/__tests__/coach-invite.e2e-spec.ts`

**Step 1: Write the failing test:**
- TRAINER `POST /coaches/invite { email, name?, message? }` → 201; creates a UNIQUE ShareLink
  (1-use, 7d, `targetEmail`) and dispatches an invite email (dev adapter records it).
- inviting an email that maps to a coach ALREADY ACTIVE under another trainer → 409
  `COACH_ALREADY_ACTIVE_ELSEWHERE` (BR-006).
- coach accepts via `POST /join/:code` (unique link) → creates/links `CoachProfile` to the
  link's trainer (status ACTIVE), consumes the link atomically (reuse C9); a second acceptance
  → 410 `LINK_USED`.

**Step 2: Run → FAIL.**

**Step 3: Implement** `invite` (generate unique link via `ShareLinkService`, send email). Extend
the join flow: when `link.type===UNIQUE`, route to coach acceptance — enforce single-trainer
(BR-006) before linking; consume atomically (C9). CoachProfile access via the documented
tenant pattern (Phase B M3 note).

**Step 4: Run → PASS.**

**Step 5: Commit** `feat(coaches/C11): coach invite + acceptance, single-trainer guard (BR-006)`

---

### Task C12: Coach invitation list + resend (edge A, idempotent)

**Files:** modify `coaches.controller.ts`/`coaches.service.ts`; create
`coaches/dto/coach-invitation.dto.ts`; Test: `modules/coaches/__tests__/coach-invite-resend.e2e-spec.ts`

**Step 1: Write the failing test:**
- `GET /coaches/invitations` (TRAINER) → 200 list with status `PENDING|ACCEPTED|EXPIRED`
  (derive from the underlying ShareLink: unconsumed+unexpired=PENDING, used=ACCEPTED,
  expired=EXPIRED), tenant-scoped.
- `POST /coaches/invitations/:id/resend` → 200; refreshes the unique link (new 7d expiry,
  `useCount=0`) and re-emails. **Idempotent per outstanding invite:** resending to a
  `targetEmail` that already has an unconsumed, unexpired unique link reuses/refreshes that
  one — does NOT spawn a second live link (edge A). Assert only one active link per
  targetEmail afterward.

**Step 2: Run → FAIL.**

**Step 3: Implement** invitation derivation + resend with the idempotency guard (find existing
outstanding link for `targetEmail`; refresh it rather than create a duplicate).

**Step 4: Run → PASS.**

**Step 5: Commit** `feat(coaches/C12): coach invitation list + idempotent resend (edge A)`

---

## Phase C Acceptance Gate (must all hold)

1. C1–C12 implemented + committed; `npx nx build api` green; full suite green via
   `NODE_ENV=test npx nx test api --skip-nx-cache --maxWorkers=1`.
2. New migrations run cleanly on a fresh DB from the single `run-migrations.mjs` source.
3. **Genuine, sanity-checked tests** for the security-critical paths — each confirmed to go RED
   when its protection is removed:
   - Edge E single-use race (C9), no-duplicate association (C8), child-block (C10),
     tenant isolation of `GET /sharelinks` (C4), single-trainer guard (C11).
4. No `node_modules`/`dist`/`uploads` tracked; no `expect(true)` no-ops.
5. Coverage of all five edge cases A–E and the public-vs-tenant-scoped lookup nuance.

## Out of scope (later phases / cross-epic)
- Child sub-login *creation/auth* (Phase D — only the block behavior is here).
- ShareLink usage **analytics consumption/reporting** (Epic-06; we only record `useCount`).
- Camp-to-User pre-fill on registration (Epic-08 — `JoinViaLinkDto` variant).

## Open gaps touching Phase C
- Q-01.04 (email templates): invite + parent-block emails use the dev EmailService port; real
  templates pending.
- Coach acceptance "status Pending vs Active" (US-01.08) — confirm desired initial status with
  the trainer flow; default ACTIVE on acceptance here.

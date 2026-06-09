# Open-Gap Resolution Plan — TASK-001

**Task:** TASK-001 · Resolves the "Open Gaps" listed at the bottom of `writing-plans-plan.md`.

> **For Claude:** Backend Epic-01 (A–G) is already merged to `master`. Implement these
> resolutions on a NEW branch `task-001/gap-resolutions` off `master`, via the `coder` skill,
> then open a PR. Per-task TDD; explicit entity `type:` on every column (PR #4 lesson);
> dev-mode boot check before claiming done.

**Decisions (from product clarification, 2026-06-09):**

| Gap | Decision |
|-----|----------|
| **Q-01.01** skill level | Fixed enum `SkillLevel = BEGINNER \| INTERMEDIATE \| ADVANCED \| ELITE` (trainer-set, nullable). |
| **Q-01.02** age model | Store `dateOfBirth` (date); derive current age + age-group on read. Drop the `age` int (no real data yet). Keep BR-017 (resulting age 1–18). |
| **Q-01.04** email | Keep the `EmailService` port; add a **Nodemailer SMTP adapter** (env-selected: dev=log/Mailpit, prod=SMTP — provider-agnostic). Define the **full transactional template set**. |
| **Q-01.06** coach override notify | **Notify the coach** on availability override: email (via EmailService) **+ in-app** (new lightweight `Notification` record). Replaces the `TODO(Q-01.06)` stub. |
| **Epic-05** payment fields | **Boundary decision (no Epic-01 code change):** `TrainerProfile.stripeAccountId` (+ future subscription/fee fields) stay as **nullable placeholders owned by Epic-05** — Epic-01 stores, never writes payment business logic. Documented; revisit when Epic-05 lands. |
| **Epic-08** camp mapping | **Boundary decision (no Epic-01 code change):** `JoinViaLinkDto` already carries the registration fields; Epic-08 will map a camp/eval submission → those fields (pre-fill). Documented interim contract; built in Epic-08. |

---

## Tasks

### GR1 — Q-01.01: `SkillLevel` enum

**Files:** `modules/users/entities/player-profile.entity.ts`, a `skill-level.enum.ts`,
`modules/users/dto/*` (profile/child DTOs that accept skillLevel), migration, tests.

**Step 1 (test, failing):** PATCH a player profile with `skillLevel: 'INTERMEDIATE'` → persists;
with `skillLevel: 'PRO'` → 400 validation. Entity round-trips the enum.
**Step 2:** run → FAIL.
**Step 3:** Add `export enum SkillLevel { BEGINNER, INTERMEDIATE, ADVANCED, ELITE }`. Make the
column a Postgres enum: `@Column({ type: 'enum', enum: SkillLevel, nullable: true, default: null })`.
Migration: create the `player_skill_level` enum type + `ALTER TABLE player_profiles ALTER COLUMN
skill_level TYPE ... USING skill_level::player_skill_level` (column is currently always NULL, so the
cast is safe). Add `@IsEnum(SkillLevel) @IsOptional()` on the DTO(s) that set skill level.
**Step 4:** run → PASS.
**Step 5:** commit `feat(users): SkillLevel enum (Q-01.01)`.

### GR2 — Q-01.02: `dateOfBirth` model + age derivation

**Files:** `player-profile.entity.ts`, `modules/players/dto/create-child.dto.ts` (+ any DTO using
`age`), a `age.util.ts` (`deriveAge(dob)`, `deriveAgeGroup(dob)`), availability filter, migration, tests.

**Step 1 (test, failing):**
- `deriveAge('2015-03-01')` returns the correct current age (inject a "now" or pass a reference date
  for determinism — do NOT use real `Date.now()` in the unit test; pass `asOf`).
- `CreateChildDto` accepts `dateOfBirth` (ISO date); a DOB implying age <1 or >18 → 400 (BR-017).
- creating a child persists `dateOfBirth`; the response exposes derived `age` + `ageGroup`.
**Step 2:** run → FAIL.
**Step 3:** Add `@Column({ name: 'date_of_birth', type: 'date', nullable: true, default: null })
dateOfBirth: string | null`. Implement `age.util.ts` (pure, takes `asOf` ref date; ageGroup e.g.
U6/U8/U10/U12/U14/U16/U18 derived from age — define the buckets). Swap `CreateChildDto.age` →
`dateOfBirth` (validate derived age 1–18). Response DTOs compute `age`/`ageGroup` from DOB.
Trainer availability/age filters derive from DOB. Migration: add `date_of_birth`, **drop `age`**
(no real data). Update PlayersChildService.
**Step 4:** run → PASS.
**Step 5:** commit `feat(players): dateOfBirth + derived age/age-group (Q-01.02)`.

### GR3 — Q-01.04: Email templates + SMTP adapter

**Files:** `shared/integrations/email/` — `email.service.ts` (port, exists), new
`smtp-email.adapter.ts` (Nodemailer), `templates/` (template registry), env-based provider
selection in the module, tests. Wire every send site (auth reset/verify, trainer invite, coach
invite, approval request/result, child-blocked parent notice, welcome).

**Step 1 (test, failing):**
- A `TemplateRegistry.render('password-reset', data)` returns subject+html+text with the data
  interpolated (assert key fields present); unknown template id → throws.
- `EmailService` selects the adapter by env (`EMAIL_PROVIDER=smtp` → SmtpEmailAdapter; default/dev
  → existing log adapter). With a mocked transport, `send()` calls the transport with the rendered
  message (assert to/subject).
**Step 2:** run → FAIL.
**Step 3:** `npm i nodemailer` (+ `@types/nodemailer` dev). Implement `SmtpEmailAdapter`
(`nodemailer.createTransport` from env: `SMTP_HOST/PORT/USER/PASS/FROM`). Build a `TemplateRegistry`
with the **full set**: welcome, password-reset, email-verify, trainer-invite, coach-invite,
approval-request, approval-result (approved/denied), child-sharelink-blocked. Provider selection in
EmailModule via `ConfigService` (default = dev log adapter, so tests/dev are unchanged). Replace any
ad-hoc inline email bodies at the call sites with `TemplateRegistry` ids.
**Step 4:** run → PASS (full suite still green; dev adapter remains default so no live SMTP needed).
**Step 5:** commit `feat(email): nodemailer SMTP adapter + transactional template registry (Q-01.04)`.

### GR4 — Q-01.06: Coach override notification (email + in-app)

**Files:** new `modules/notifications/` (entity `Notification`: id, userId, type, title, body,
read, createdAt — all columns explicitly typed; repository; service; `GET /notifications`,
`POST /notifications/:id/read`), `modules/availability/availability.service.ts` (replace the
`TODO(Q-01.06)` stub), migration, tests.

**Step 1 (test, failing):** when a trainer logs a coach availability override, an in-app
`Notification` row is created for the coach (type `AVAILABILITY_OVERRIDE`, includes the reason) AND
an email is dispatched (assert via the EmailService dev-adapter record). `GET /notifications` returns
the coach's notifications; mark-read flips `read`. **Failing-first sanity:** removing the notify call
leaves zero notifications → test red.
**Step 2:** run → FAIL.
**Step 3:** Add the `Notifications` module + entity/migration. In `AvailabilityService` override
path, create the in-app notification + send the `availability-override` email (add that template to
GR3's registry). Wire NotificationsModule into AppModule.
**Step 4:** run → PASS.
**Step 5:** commit `feat(availability): notify coach on override — in-app + email (Q-01.06)`.

### GR5 — Documentation (cross-epic boundaries + spec sync)

**Files:** `specs/architect-architecture.md`, `tasks/TASK-001/requirements-analyst-requirements.md`
(gap analysis), `specs/api-designer-spec.md` (skillLevel enum, dateOfBirth DTO change), README open-gaps table.

- Mark Q-01.01/02/04/06 **RESOLVED** with the decisions above in the requirements gap analysis +
  architecture open-gaps table.
- Document the **Epic-05** boundary: TrainerProfile payment fields are nullable placeholders owned by
  Epic-05 (Epic-01 stores only).
- Document the **Epic-08** boundary: camp→registration field-mapping contract (JoinViaLinkDto fields)
  to be implemented in Epic-08.
- Update `api-designer-spec.md` for the `skillLevel` enum + `dateOfBirth` (replacing `age`) and the
  new `/notifications` endpoints.
- commit `docs: resolve Q-01.01/02/04/06 + Epic-05/08 boundary decisions`.

---

## Exit Gate

1. GR1–GR4 implemented + committed (per-task); GR5 docs updated.
2. `npx nx build api` green; full backend suite green (report counts vs the 330 baseline).
3. **App boots in dev mode** (new enum/columns/notifications module) — paste success line.
4. New migrations (skill-level enum, date_of_birth, notifications) run on a fresh DB; **`age` column dropped**.
5. Sanity-checks: skillLevel rejects bad value (400), DOB age 1–18 enforced, override creates coach notification (red-before-green).
6. Pushed `task-001/gap-resolutions`; hygiene clean; PR opened.

## Notes / risks
- GR2 drops `age` — confirm no real data depends on it (dev/test only; safe). Frontend Family/age
  filters (F-Index, not yet built) should consume `dateOfBirth`/`ageGroup`.
- GR3 keeps the dev log adapter as default so the existing 330 tests stay green without live SMTP.
- GR4 adds a small Notifications module — the first general in-app notification channel; future
  epics (approvals, etc.) can reuse it.

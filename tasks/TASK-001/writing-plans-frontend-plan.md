# Frontend (Web) Implementation Plan — TASK-001

**Task:** TASK-001 (Epic-01) · **Layer:** Frontend follow-on (backend Phases A–C live).

> **For Claude:** Implement on a NEW branch `task-001/frontend` off `master` (the frontend is a
> separate Nx app `apps/web`, so it won't conflict with backend branches and can proceed in
> parallel). Use the `coder-frontend` skill. Foundation-deep: full bite-sized TDD for the app
> shell + design system + signature components + the screens whose backend is live (auth, users,
> profile, sharelinks); the family/approvals/availability screens are an INDEX (their backend,
> Phases D–E, isn't built yet).

**Goal:** Build the "Editorial Athletic" web client — design-system tokens, the signature
ContextSwitcher/Masthead + ImpersonationBanner, and the live screens (Login, Registration/join,
Super-Admin UsersTable, ProfileEdit, ShareLinkModal) against the existing NestJS API.

**Architecture:** Vite React SPA in the Nx monorepo (`apps/web`), consuming the NestJS API at
`/api/v1` via the **session cookie** (`credentials: 'include'`) + **CSRF token** header on
mutations (no JWT/bearer). TanStack Query for server state; a thin AuthProvider + ContextProvider
for session/active-context; Tailwind reading design tokens as CSS variables, with the dynamic
white-label `--brand` token set per trainer and a runtime WCAG contrast guard.

**Tech Stack:** Nx · Vite · React + TypeScript · React Router · TanStack Query · react-hook-form ·
Tailwind (CSS-var tokens) · Framer Motion · Fontshare fonts (Clash Display / Satoshi / Martian
Mono, self-hosted) · Vitest + React Testing Library + MSW.

**Source specs:** `specs/frontend-design-spec.md` (design system + 13 component specs, the
signatures, motion, a11y), `specs/api-designer-spec.md` (endpoints, DTOs, error envelope, exact
errorCodes), `specs/architect-architecture.md` (auth/session model).

**Conventions (locked):** session-cookie auth + `X-CSRF-Token` on mutations; `{data,meta}` list
envelope; Nest error shape (`{statusCode,message,error,errorCode,details}`); UUIDs in URLs; WCAG
2.1 AA (NFR-006); responsive per the design spec; `prefers-reduced-motion` honored. Genuine tests
(RTL behavior + MSW-mocked API; no hollow assertions); commit per green task.

**Test commands:** Targeted `npx nx test web -- -t "<name>"`; full `npx nx test web`;
build `npx nx build web`; dev `npx nx serve web` (Vite proxy → backend `:3000`).

---

## Phase Map (frontend)

| Group | Scope | Detail |
|-------|-------|--------|
| **F-Shell** | App scaffold, tokens, API client, auth/query providers, routing, UI primitives | **Bite-sized (below)** |
| **F-Signature** | ContextSwitcher/Masthead, ImpersonationBanner | **Bite-sized** |
| **F-Live** | Login, Registration/join, SA UsersTable + CreateUser, ProfileEdit, ShareLinkModal | **Bite-sized** |
| **F-Index** | FamilyDashboard, BestTimesGrid, MyTimesGrid, ApprovalsQueue (backend D–E pending) | **Index** |

---

# F-SHELL — App foundation (bite-sized TDD)

### Task F1: Scaffold Nx React (Vite) app + test tooling

**Files:** Create `apps/web/` (Nx React+Vite), configure Vitest + RTL + MSW.

**Step 1:** Generate the app.
Run:
```bash
npx nx g @nx/react:app web --bundler=vite --unitTestRunner=vitest --e2eTestRunner=none --style=css --routing=true
npm i @tanstack/react-query react-router-dom react-hook-form framer-motion
npm i -D msw @testing-library/react @testing-library/user-event @testing-library/jest-dom
```
**Step 2:** Add a Vite dev proxy so `/api` → `http://localhost:3000` (`apps/web/vite.config.ts`
`server.proxy`). Add MSW server setup in `apps/web/src/test-setup.ts` (`@testing-library/jest-dom`
+ MSW `beforeAll/afterEach/afterAll`).
**Step 3:** Smoke test: render `<App/>` → shows a root landmark.
Run: `npx nx test web` → PASS.
**Step 4: Commit** `chore(web): scaffold nx react+vite app with vitest/rtl/msw`

---

### Task F2: Design tokens (Tailwind + CSS vars) + fonts

**Files:** Create `apps/web/src/styles/tokens.css`, `tailwind.config.ts`, self-host fonts in
`apps/web/src/assets/fonts/`; Test: `apps/web/src/styles/__tests__/tokens.spec.ts`

**Step 1: Write the failing test** — a tiny assertion that the token contract exists (import a
`tokens.ts` map mirroring the CSS vars and assert keys like `paper`, `ink`, `brand`, `hazard`,
`speedAngle` exist; this keeps JS/CSS token names in sync).
**Step 2:** Run → FAIL.
**Step 3:** Implement `tokens.css` with the full palette from the design spec (`:root` light +
`[data-theme="dark"]`), including the dynamic `--brand`, `--brand-tint`, `--brand-strong`,
`--hazard`, semantics, `--speed-angle`. Self-host Clash Display / Satoshi / Martian Mono via
`@font-face`. Configure Tailwind `theme.extend.colors` to reference the CSS vars
(`brand: 'var(--brand)'`, etc.) and `fontFamily` (display/body/mono). Export a `tokens.ts` mirror.
**Step 4:** Run → PASS.
**Step 5: Commit** `feat(web): editorial-athletic design tokens + fonts (tailwind css-vars)`

---

### Task F3: White-label `--brand` provider + runtime WCAG contrast guard

**Files:** Create `apps/web/src/providers/brand-provider.tsx`,
`apps/web/src/utils/contrast.ts`; Test: `apps/web/src/utils/__tests__/contrast.spec.ts`

**Step 1: Write the failing test** (pure logic — the highest-value unit test here):
```typescript
import { contrastRatio, resolveBrandText } from '../contrast';
describe('contrast guard', () => {
  it('computes WCAG contrast ratio', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
  it('keeps brand color for text when it passes AA on surface', () => {
    expect(resolveBrandText('#1B3A5B', '#FFFFFF')).toBe('#1B3A5B'); // ~9:1, passes
  });
  it('promotes to a darker shade when brand fails AA for text', () => {
    const out = resolveBrandText('#7FD1FF', '#FFFFFF'); // light brand, fails 4.5:1
    expect(out).not.toBe('#7FD1FF');
    expect(contrastRatio(out, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
```
**Step 2:** Run → FAIL.
**Step 3:** Implement `contrastRatio` (relative luminance per WCAG) and `resolveBrandText`
(darken brand via OKLab/HSL steps until ≥4.5:1). `BrandProvider` sets `--brand` on a root element
from the active trainer's `primaryColorHex` (default platform ink-blue when no trainer context),
and sets a `--brand-strong`/text-safe var from `resolveBrandText`. SA chrome ignores `--brand`.
**Step 4:** Run → PASS.
**Step 5: Commit** `feat(web): white-label brand provider + runtime WCAG contrast guard`

---

### Task F4: API client (cookie + CSRF + error envelope)

**Files:** Create `apps/web/src/api/client.ts`, `apps/web/src/api/errors.ts`;
Test: `apps/web/src/api/__tests__/client.spec.ts` (MSW)

**Step 1: Write the failing test** (MSW-mocked):
- GET returns parsed JSON; sends `credentials: 'include'`.
- A mutation (POST) fetches a CSRF token from `GET /api/v1/auth/csrf` and sends it as
  `X-CSRF-Token`.
- a 4xx response throws an `ApiError` exposing `errorCode` + `message` + `details` parsed from the
  Nest error envelope (assert `err.errorCode === 'EMAIL_EXISTS'` for a mocked 409).
**Step 2:** Run → FAIL.
**Step 3:** Implement a thin fetch wrapper: base `/api/v1`, `credentials: 'include'`, JSON
headers; for unsafe methods, lazily GET+cache the CSRF token and attach `X-CSRF-Token`; on
non-2xx, parse the envelope into a typed `ApiError`. Export typed helpers `get/post/patch/del`.
**Step 4:** Run → PASS.
**Step 5: Commit** `feat(web): api client with cookie auth, csrf, typed error envelope`

---

### Task F5: TanStack Query + AuthProvider (`useMe/useLogin/useLogout`)

**Files:** Create `apps/web/src/providers/query-provider.tsx`, `auth-provider.tsx`,
`apps/web/src/api/endpoints/auth.ts`, hooks; Test: `apps/web/src/providers/__tests__/auth-provider.spec.tsx`

**Step 1: Write the failing test** (RTL + MSW):
- with a mocked `GET /auth/me` (200), `useMe()` exposes the principal (`role`, `activeContext`,
  `impersonatedBy`, `isChild`).
- `useLogin()` posts creds → invalidates `me` → principal populates.
- `useLogout()` clears the session/query cache → `me` becomes unauthenticated.
- a 401 from `/auth/me` resolves to "unauthenticated" (no crash).
**Step 2:** Run → FAIL.
**Step 3:** Implement `QueryProvider` (TanStack `QueryClient`), `auth.ts` endpoints, and
`AuthProvider` exposing `useMe/useLogin/useLogout` over the API client. Map `MeResponseDto`.
**Step 4:** Run → PASS.
**Step 5: Commit** `feat(web): query provider + auth provider (me/login/logout)`

---

### Task F6: Routing + role-based route guard

**Files:** Create `apps/web/src/routes/index.tsx`, `apps/web/src/routes/RequireRole.tsx`,
`apps/web/src/components/layout/AppShell.tsx`; Test: `routes/__tests__/require-role.spec.tsx`

**Step 1: Write the failing test:**
- unauthenticated visiting a protected route → redirected to `/login`.
- a PLAYER visiting an SA-only route (`/admin/users`) → redirected/forbidden screen.
- a SUPER_ADMIN reaches `/admin/users`.
- `mustChangePassword=true` forces redirect to the change-password screen (FR-006).
**Step 2:** Run → FAIL.
**Step 3:** Implement `RequireRole` (reads `useMe`, gates by role, handles loading) and the route
table (React Router) + `AppShell` (nav rail/bottom-tab per design spec, hosts the masthead +
impersonation banner slots).
**Step 4:** Run → PASS.
**Step 5: Commit** `feat(web): router + role-based route guard + app shell`

---

### Task F7: UI primitives (Button, Input, Sheet, DataTable)

**Files:** Create `apps/web/src/components/ui/{Button,Input,Sheet,DataTable,StatNumber}.tsx`;
Tests alongside in `__tests__/`

**Step 1: Write failing tests** (one per primitive, behavior + a11y):
- `Button` renders, fires `onClick`, shows loading state (disabled + speed-rule sweep), has an
  accessible name.
- `Input` (underline style) associates `label`+`id`, shows error text via `aria-describedby`,
  sets `aria-invalid`.
- `Sheet` traps focus when open, closes on Esc, restores focus on close.
- `DataTable` renders `{data,meta}`, shows empty state, exposes column headers as `<th scope>`.
- `StatNumber` (tale-of-the-tape) renders tabular-nums, respects `prefers-reduced-motion` (no
  count-up animation when reduced).
**Step 2:** Run → FAIL.
**Step 3:** Implement the primitives per the design spec (square-ish corners, hairline borders,
speed-rule motif via Tailwind/clip-path, Framer Motion for the sweep/count-up gated on reduced
motion). Keep them token-driven (use the CSS-var Tailwind classes).
**Step 4:** Run → PASS.
**Step 5: Commit** `feat(web): editorial-athletic ui primitives (button/input/sheet/table/stat)`

---

# F-SIGNATURE — the memorable components (bite-sized TDD)

### Task F8: ImpersonationBanner (signature)

**Files:** Create `apps/web/src/features/impersonation/ImpersonationBanner.tsx`,
`api/endpoints/impersonation.ts`; Test: `__tests__/impersonation-banner.spec.tsx`

**Step 1: Write the failing test:**
- when `useMe().impersonatedBy` is set, renders a sticky `role="alert"` hazard bar
  "VIEWING AS [NAME]" + a live countdown toward the 1h cap.
- "EXIT IMPERSONATION" calls `POST /impersonation/exit` and refetches `me`.
- when NOT impersonating, renders nothing.
- under `prefers-reduced-motion`, the hazard-stripe drift is disabled.
- countdown reaching 0 triggers auto-exit (mock timer).
**Step 2:** Run → FAIL.
**Step 3:** Implement the banner (hazard token, diagonal stripe, countdown from
`activeContext`/session start, Framer Motion drift gated on reduced motion). Pushes content down
(layout offset), never overlaps.
**Step 4:** Run → PASS.
**Step 5: Commit** `feat(web): impersonation hazard banner with countdown + auto-exit`

---

### Task F9: ContextSwitcher / Masthead (signature)

**Files:** Create `apps/web/src/features/context/ContextSwitcher.tsx`,
`providers/active-context-provider.tsx`, `api/endpoints/players-context.ts`;
Test: `__tests__/context-switcher.spec.tsx`

**Step 1: Write the failing test:**
- renders the active context as a masthead (`MAYA → COACH BOB`) from
  `GET /players/me/contexts`; single-context → static masthead (no chevron).
- multi-context → opens a channel list grouped "Your Training" (Me→trainers) + "Your Children's
  Training" (child→trainers); a CHILD principal sees only their own trainer list (no "Me" group).
- selecting an entry calls `POST /players/me/context` and updates the active context (and thus
  what tenant-scoped reads return).
- keyboard: arrow-key roving + Enter selects; the list is a proper `listbox`/menu with names.
**Step 2:** Run → FAIL.
**Step 3:** Implement the masthead + dropdown/bottom-sheet (responsive), the "channel-change"
wipe (Framer Motion, gated on reduced motion), and `ActiveContextProvider` persisting the active
context. Render groups per the design spec's selector layout.
**Step 4:** Run → PASS.
**Step 5: Commit** `feat(web): masthead context switcher (signature) + active-context provider`

---

# F-LIVE — screens with live backend (bite-sized TDD)

### Task F10: LoginPage

**Files:** `apps/web/src/pages/LoginPage.tsx`; Test: `__tests__/login-page.spec.tsx`
**Test intent:** asymmetric editorial split; email/password underline inputs; submit → `useLogin`;
on success routes by role (SA→/admin/users, etc.); on 401 shows inline error (`aria-live`); on 429
shows rate-limit message; `mustChangePassword` routes to change-password. Loading state on the
button. **Steps:** failing test → implement → pass → `commit feat(web): login page`.

### Task F11: RegistrationView (`/join/:code`)

**Files:** `apps/web/src/pages/JoinPage.tsx`, `api/endpoints/sharelinks.ts`;
Test: `__tests__/join-page.spec.tsx`
**Test intent:** on mount, `GET /sharelinks/:code/validate` → masthead "JOIN [TRAINER]" with the
trainer brand applied; invalid/expired/revoked (410) → friendly "link no longer active"; valid →
progressive form; logged-in parent w/ children → the "Who's training?" family checklist (FR-021);
submit → `POST /join/:code`; child-blocked path (403 `CHILD_SHARELINK_BLOCKED`) → "ask a parent"
screen. **Steps:** failing → implement → pass → `commit feat(web): join/registration view`.

### Task F12: SA UsersTable + CreateUserModal + row actions

**Files:** `apps/web/src/pages/admin/UsersPage.tsx`,
`features/users/{CreateUserSheet,UserRowActions}.tsx`, `api/endpoints/users.ts`;
Test: `__tests__/users-page.spec.tsx`
**Test intent:** ink/paper (no `--brand`); paginated `{data,meta}` `DataTable` with search +
role/status filters; tale-of-the-tape total count; DELETED rows render "Deleted User" greyed;
row actions Edit/Impersonate/Deactivate/Delete; CreateUserSheet posts `POST /users` (409
`EMAIL_EXISTS` → inline error); reactivate blocked with `USER_ANONYMIZED` surfaced as a clear
message; Impersonate triggers `POST /impersonation/:id` then the banner appears. **Steps:**
failing → implement → pass → `commit feat(web): super-admin users table + create + actions`.

### Task F13: ProfileEdit (all roles)

**Files:** `apps/web/src/pages/ProfilePage.tsx`, `api/endpoints/profile.ts`;
Test: `__tests__/profile-page.spec.tsx`
**Test intent:** two-column editorial form; role-specific fields (coach bio/credentials/public
toggle; player school/jersey; parent emergency contact); read-only email/role rendered as locked
mono rows; `PATCH /me/profile` save + confirmation; photo upload (`POST /me/profile/photo`,
multipart) with progress + thumbnail; validation inline. **Steps:** failing → implement → pass →
`commit feat(web): profile edit (all roles) + photo upload`.

### Task F14: ShareLinkModal (trainer)

**Files:** `apps/web/src/features/sharelinks/ShareLinkSheet.tsx`, `api/endpoints/sharelinks.ts`;
Test: `__tests__/sharelink-sheet.spec.tsx`
**Test intent:** segmented STATIC (player) vs UNIQUE (coach); static shows persistent link + QR +
mono code with copy (mono flips to "COPIED"); unique reveals `targetEmail` + 7-day/single-use
note; `POST /sharelinks` to create, `GET /sharelinks` list with usage count, revoke →
struck "REVOKED" state; coach invites list (`/coaches/invitations`) with status chips + resend.
**Steps:** failing → implement → pass → `commit feat(web): share-link generation sheet`.

---

# F-INDEX — screens pending backend D–E (expand when those land)

> These depend on backend Phases D (family/children/context data write paths, approvals) and E
> (availability). Build against MSW mocks now if desired, but prefer expanding each to bite-sized
> TDD via `/writing-plans [TASK-001] frontend-<screen>` once the backend endpoints exist.

| # | Screen | Backend dep | Key endpoints |
|---|--------|-------------|---------------|
| FI-1 | FamilyDashboard / PlayerProfilesList (player cards, add/remove child-trainer) | Phase D | `/players/me/children`, `/players/me/children/:id/trainers` |
| FI-2 | BestTimesGrid (player/parent availability, per-child) | Phase E | `GET/PUT /players/:profileId/availability` |
| FI-3 | MyTimesGrid (coach availability) | Phase E | `GET/PUT /coaches/me/availability` |
| FI-4 | ApprovalsQueue (parent; USD/token, 48h countdown ring, per-child token toggle) | Phase D | `/approvals`, `/approvals/:id/approve|deny`, `/children/:id/token-setting` |
| FI-5 | TrainerBranding settings (logo upload + color picker, live preview) | Phase G | `GET/PUT /trainers/me/branding` |

---

## Acceptance Gate (frontend foundation)

1. F1–F14 implemented + committed; `npx nx build web` green; `npx nx test web` green.
2. Genuine RTL + MSW tests (no hollow assertions); the contrast guard (F3), API client/CSRF (F4),
   route guard (F6), and both signatures (F8/F9) have real behavioral coverage.
3. **Accessibility (NFR-006):** keyboard paths for context switcher + table + sheets (focus
   trap/restore), `aria-live` async results, impersonation banner `role="alert"`,
   `prefers-reduced-motion` disables wipes/sweeps/stripe-drift, visible focus rings, contrast
   guard active. Add a smoke a11y check (e.g. `axe` via `vitest-axe`) on Login + UsersTable.
4. White-label: setting a trainer `primaryColorHex` re-themes via `--brand`; a low-contrast brand
   auto-promotes for text (F3 test proves it).
5. No tracked build output/node_modules; commit per task.

## Out of scope / cross-epic
- Real-time updates, i18n, offline. Camp-to-User pre-fill variant (Epic-08). Marketing/analytics
  surfaces (Epic-06).

## Open gaps touching frontend
- Q-01.01 skill-level chips (player cards/profile), Q-01.02 age-group labels — render from
  backend enums once defined. Q-01.04 transactional emails are backend-side (no app UI).

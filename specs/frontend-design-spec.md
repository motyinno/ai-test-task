# Frontend Design — Design System & Components

> Living frontend specification. Read `MANIFEST.md` → `architect-architecture.md` →
> `api-designer-spec.md` first. Depends on all three.

---

## [TASK-001] Design Foundation — "Editorial Athletic" (2026-06-08)

### Aesthetic Direction & Rationale

**Editorial Athletic** — the confidence of a premium sports magazine fused with the
clarity of a serious data tool. Strong typographic hierarchy, a disciplined structural
grid, oversized "tale-of-the-tape" numerals for the metrics that matter (players,
availability, tokens, counts), and a recurring **kinetic diagonal "speed rule"** motif
that injects athletic energy without decoration-for-decoration's-sake.

**Why this direction wins for this platform:**
- **White-label safe (FR-054):** the canvas is intentionally color-neutral (warm
  paper + ink). The trainer's brand color is the *only* chromatic voice in their portal,
  so it reads as deliberate identity, not as one of many competing colors.
- **Serves four audiences from one system:** the same editorial grid scales from
  dense Super-Admin tables to a parent's warm family dashboard — hierarchy and numerals
  do the heavy lifting, so we don't need four different visual languages.
- **Athletic without juvenile:** energy comes from typography, motion, and the speed-rule
  motif — not from bright primary colors or cartoon roundness.

### The Memorable Element

**The Masthead Context Bar + Tale-of-the-Tape numerals.**

Multi-trainer / family context switching is *the* defining interaction of this platform,
so we make it the signature. The active context renders as a bold **editorial masthead /
dateline** across the top of every family view — `MAYA → COACH BOB` set in condensed
display caps with a mono sub-label — and that masthead *is* the context switcher (tap to
open the channel list, switch animates like changing a broadcast channel). Throughout the
product, key metrics are rendered as **oversized condensed numerals with mono labels**,
like fight-card stats — a player's available hours, a trainer's roster count, a token
balance. You remember the product because every screen feels like it's keeping score.

A second unmistakable signature: the **hazard-tape impersonation banner** — a sticky,
diagonally-striped bar that makes "you are viewing as someone else" impossible to miss.

---

### Typography

Distinctive, free (Fontshare), and characterful — explicitly **not** Inter/Roboto/system.

| Role | Font | Usage |
|------|------|-------|
| **Display** | **Clash Display** (Fontshare) | Headlines, mastheads, the tale-of-the-tape numerals, section markers. Condensed-leaning editorial confidence. Weights 600/700. |
| **Body / UI** | **Satoshi** (Fontshare) | All UI text, forms, tables, paragraphs. Geometric grotesque with warmth; excellent at small sizes + dense data. Weights 400/500/700. |
| **Data / Mono** | **Martian Mono** (Fontshare) | Tabular numerals, availability times, ShareLink codes, audit timestamps, status labels (UPPERCASE tracking). |

**Scale (1.25 major-third, fluid via `clamp`):**

```css
--font-display: 'Clash Display', sans-serif;
--font-body:    'Satoshi', sans-serif;
--font-mono:    'Martian Mono', monospace;

--text-stat:  clamp(3rem, 6vw, 5.5rem);   /* tale-of-the-tape numerals, display, -0.03em */
--text-h1:    clamp(2rem, 4vw, 3rem);      /* display 700 */
--text-h2:    1.75rem;  --text-h3: 1.25rem;
--text-body:  1rem;     --text-sm: 0.875rem;
--text-label: 0.75rem;  /* mono, UPPERCASE, letter-spacing 0.08em */
```

Hierarchy rules: display caps for mastheads/headlines; mono UPPERCASE micro-labels above
data; body sentence-case everywhere else. Numerals are always `font-variant-numeric:
tabular-nums` in tables and grids.

---

### Color Palette & White-Label Token System

The palette is split into **fixed platform tokens** (never change) and a **dynamic brand
token** (`--brand`, set per trainer context from `BrandingResponseDto.primaryColorHex`).

```css
:root {
  /* Fixed canvas — warm editorial paper, not stark white (avoids AI-slop pure #fff) */
  --paper:    #F7F4EE;   /* app background */
  --surface:  #FFFFFF;   /* cards/sheets */
  --ink:      #14151A;   /* primary text (warm near-black) */
  --ink-2:    #3A3D45;   /* secondary text */
  --muted:    #8A8D96;   /* tertiary / placeholders */
  --line:     #E6E1D7;   /* hairlines, dividers, table rules */

  /* Dynamic white-label accent — defaults to platform ink-blue when no trainer context */
  --brand:        #1B3A5B;                       /* overridden per trainer org */
  --brand-tint:   color-mix(in oklab, var(--brand) 12%, var(--surface));
  --brand-strong: color-mix(in oklab, var(--brand) 80%, black);
  --on-brand:     #FFFFFF;                        /* contrast-checked at runtime */

  /* Fixed semantics (intentionally OUTSIDE typical trainer-brand space) */
  --hazard:   #FF5A1F;   /* impersonation banner ONLY — safety orange */
  --success:  #1E7A4D;
  --danger:   #C42B2B;
  --warning:  #B7791F;
  --info:     #2563A8;

  --shadow-card: 0 1px 0 var(--line), 0 12px 28px -18px rgba(20,21,26,0.25);
  --speed-angle: -18deg;  /* the kinetic diagonal motif */
}

[data-theme="dark"] {
  --paper:   #101216;  --surface: #181B21;  --ink: #F2EFE9;  --ink-2: #B9BCC4;
  --muted:   #767A84;  --line:    #262A31;
  --brand-tint: color-mix(in oklab, var(--brand) 22%, var(--surface));
}
```

**White-label rules:**
- The trainer's `primaryColorHex` is injected as `--brand` at the portal root when a
  trainer context is active. All accents (active states, primary buttons, the speed-rule,
  focus rings) derive from `--brand` via `color-mix` — so a single value re-themes the
  whole portal.
- **Runtime contrast guard:** compute WCAG contrast of `--brand` against `--surface`; if
  it fails AA for text, auto-shift to `--brand-strong` for text/icons and reserve the raw
  brand color for fills only (satisfies NFR-006 even with a low-contrast trainer color).
- **Platform/Super-Admin chrome ignores `--brand`** — SA tools render in pure ink/paper +
  fixed semantics, signalling "system-level, not any one org."

---

### Spatial System & The Speed-Rule Motif

- **Grid:** 12-col, 72px max gutter, `--space` scale on a 4px base (4/8/12/16/24/40/64/96).
- **Editorial asymmetry:** content uses a 8/4 split (primary canvas + rail) rather than
  dead-center symmetry; section headers hang a mono label into the left margin.
- **Speed rule:** the recurring motif — a thin diagonal (`--speed-angle`) accent bar used
  for: active nav indicators, section dividers, primary-button hover sweep, the masthead
  underline, and progress/availability fills. Implemented as a `linear-gradient` shear or
  `clip-path` so it's CSS-only and cheap. Used sparingly — it's a *signature*, not wallpaper.
- **Cards:** square-ish corners (`6px`, not pill-rounded), hairline border + the layered
  `--shadow-card`. No floating drop-shadow-everywhere (anti-slop).

---

### Motion Strategy

React + **Motion (Framer Motion)**; all motion respects `prefers-reduced-motion`.

| Moment | Behavior |
|--------|----------|
| Page load | Orchestrated staggered reveal: masthead → stats count-up → content rows cascade (40ms stagger, ease `[0.22,1,0.36,1]`). |
| Context switch | "Channel change" — current view wipes out along the speed-angle, new context wipes in; masthead text does a quick vertical roll. ~280ms. |
| Stat numerals | Count-up on first paint (tale-of-the-tape feel), tabular-nums so layout never shifts. |
| Availability grid | Cells fill with a diagonal sweep when a range is selected; drag-paint cells with spring feedback. |
| Buttons | Primary: speed-rule sweep across the fill on hover; press = 2px down + shadow collapse. |
| Impersonation banner | Subtle continuous hazard-stripe drift (paused under reduced-motion) so it stays attention-grabbing. |

---

## Component Visual Specs

Each lists: visual, states, interaction, responsive. All meet WCAG 2.1 AA (NFR-006).

### [TASK-001] LoginForm (2026-06-08)
**Page:** Auth · **Aesthetic:** stark editorial split.
- **Layout:** asymmetric two-panel. Left = oversized Clash Display masthead + a slow
  speed-rule field on `--paper`; right = the form card on `--surface`. On a trainer's
  branded login, left panel shows the trainer logo + `--brand` speed-rule.
- **Fields:** email + password, mono micro-labels above each, single hairline underline
  inputs (not boxed). Child sub-login hint link: "Logging in for a child? Use the family
  username." (child principal supported by same endpoint).
- **States:** Default · Focused (underline thickens to `--brand`, label lifts) · Loading
  (button speed-rule sweeps continuously) · Error (`--danger` underline + inline message,
  `aria-live`) · Rate-limited (429 → "Too many attempts, try again in N min").
- **Responsive:** < 768px, left masthead collapses to a slim top band; form full-width.

### [TASK-001] RegistrationView (Join via ShareLink) (2026-06-08)
**Page:** `/join/:code` · serves FR-020/021/023.
- **Header:** masthead = "JOIN [TRAINER NAME]" with trainer logo + `--brand` applied
  (preview comes from `GET /sharelinks/:code/validate`).
- **Body:** progressive form — account fields, then a "Who's training?" block. For a
  logged-in parent with children, this becomes the **family checklist** (Me + each child,
  FR-021) rendered as toggle chips with the tale-of-the-tape count ("3 SELECTED").
- **States:** Valid link · Invalid/expired/revoked (410 → friendly "This link's no longer
  active" with trainer contact) · Already-associated (no-op confirmation) · Child blocked
  (FR-027 → "Ask a parent" screen + "we've emailed your parent" confirmation).
- **Responsive:** single column < 768px; checklist chips wrap.

### [TASK-001] ContextSwitcher / Masthead Bar (2026-06-08) — **SIGNATURE**
**Cross-cutting** · serves FR-021/025.
- **Resting:** a top masthead — active context in Clash Display caps
  (`MAYA → COACH BOB`) + mono sub-label (sport/role), a small chevron, and the active
  trainer's logo chip. Speed-rule underline in `--brand`.
- **Open:** drops a "channel list" panel grouped per the spec's selector layout —
  **Your Training** (Me → each trainer) and **Your Children's Training** (child → each
  trainer). Child principals see only their own trainer list (no "Me" group). Each row
  shows trainer logo + a live mono dot (active context highlighted with `--brand` fill).
- **Interaction:** select → "channel change" wipe; `POST /players/me/context`; persists
  across session. Keyboard: full arrow-key roving + type-ahead.
- **States:** Single-context (masthead static, no chevron) · Multi · Switching (skeleton
  masthead during the wipe).
- **Responsive:** < 768px becomes a full-height bottom sheet.

### [TASK-001] ImpersonationBanner (2026-06-08) — **SIGNATURE**
**Cross-cutting (SA)** · serves FR-015.
- **Visual:** sticky top bar, full-bleed, `--hazard` with a diagonal hazard-stripe texture
  (drifts slowly). Text: "VIEWING AS [NAME] · [ROLE]" in mono caps + a live countdown to
  the 1h cap. "EXIT IMPERSONATION" button (high-contrast, right-aligned).
- **Behavior:** pushes page content down (never overlaps); countdown turns urgent (pulse)
  under 5 min; auto-exits at 0 with a toast. `role="alert"`, always reachable.
- **Responsive:** text truncates to "VIEWING AS [NAME]"; exit stays visible.

### [TASK-001] UsersTable (Super Admin) (2026-06-08)
**Page:** SA Users · serves FR-010 · ink/paper only (no `--brand`).
- **Visual:** editorial data table — mono UPPERCASE column heads, hairline row rules,
  tabular-nums. Status as a typographic chip (ACTIVE / INACTIVE / DELETED) — DELETED rows
  render the anonymized "Deleted User" greyed with a strike-accent. Tale-of-the-tape total
  count in the header ("12,481 USERS").
- **Controls:** tool-specific search + role/status filters (segmented, mono labels);
  page-based pagination footer (meets <3s/10k AC). Row actions menu: Edit · Impersonate ·
  Deactivate · Delete.
- **States:** Loading (row skeletons) · Empty · Filtered-empty · Row-hover (speed-rule
  tick in the left margin) · Bulk N/A (MVP).
- **Responsive:** < 1024px collapses to stacked record cards retaining key columns.

### [TASK-001] CreateUserModal (Trainer) (2026-06-08)
**Page:** SA · serves FR-011.
- **Visual:** right-side sheet (not center modal) on `--surface`, masthead "CREATE TRAINER".
  Fields: business name, trainer name, email, phone; onboarding mode as a two-option
  segmented control (Invite Link / Temp Password).
- **States:** Default · Validating · 409 duplicate email (inline `--danger` on the email
  field) · Success (sheet closes, new row flashes into the table with a speed-rule sweep).
- **Responsive:** full-screen sheet < 768px.

### [TASK-001] FamilyDashboard / PlayerProfilesList (2026-06-08)
**Page:** Parent · serves FR-023/024.
- **Visual:** masthead context bar on top; below, a roster of family members as editorial
  "player cards" — large avatar, name in display, mono row of stats (age · # trainers ·
  next session). Each child card lists trainer associations as logo chips with a
  per-child "+ ADD TRAINER" and inline remove.
- **States:** Default · No children yet (warm empty state + "+ Add Child") · Child with no
  trainer (muted card, "Not training yet") · Remove-trainer confirm (warns RSVP cancel).
- **Responsive:** cards single-column < 768px.

### [TASK-001] BestTimesGrid (Player/Parent) & MyTimesGrid (Coach) (2026-06-08)
**Page:** Availability · serves FR-030/042.
- **Visual:** the most "athletic" surface — a 7-day × time grid; selected ranges fill with
  the `--brand` (player) / ink (coach) speed-sweep. Day labels mono caps; a tale-of-the-tape
  "AVAILABLE HOURS" total updates live as you paint. Per-profile (parent switches child via
  the masthead before editing).
- **Interaction:** click-drag to paint ranges; drag a fill edge to resize; tap a day header
  to toggle "Not Available". Touch-optimized (large hit targets, NFR-007).
- **States:** Default · Painting (spring cell feedback) · Saved (confirmation toast) ·
  Coach conflict context (when a trainer later overrides, an annotation chip appears).
- **Responsive:** < 768px rotates to day-accordion with time-range pickers (grid drag is
  hard on small touch); same data model.

### [TASK-001] ShareLinkModal (Trainer) (2026-06-08)
**Page:** Trainer · serves FR-050.
- **Visual:** sheet with a segmented type switch — **STATIC (players)** vs **UNIQUE
  (coach)**. Static shows the persistent link + QR + big mono `code` with copy; usage
  count as a tale-of-the-tape stat. Unique reveals a `targetEmail` field and notes 7-day /
  single-use; lists outstanding invitations with status chips + resend.
- **States:** Generating · Generated (code reveal animation) · Copied (mono code flips to
  "COPIED") · Revoke confirm (link goes to a struck, greyed "REVOKED" state).
- **Responsive:** full-screen sheet < 768px; QR scales down.

### [TASK-001] ApprovalsQueue (Parent) (2026-06-08)
**Page:** Parent · serves FR-028/029.
- **Visual:** a list of request cards — child name (display), event + amount (tale-of-the-
  tape numeral), a `paymentType` chip (USD / TOKEN), and a **48h countdown ring** that
  drains toward expiry. Approve (primary `--brand`) / Deny (ghost `--danger`) with an
  optional notes field. Auto-approved token spends appear in a muted "FYI" section.
- **States:** Pending · Approving (button sweep) · Resolved (card collapses, moves to
  history) · Expired (countdown hits 0 → "EXPIRED" stamp, auto-deny) · Empty ("All caught up").
- **Per-child token setting:** a toggle on each child surfaced here + on the child card
  ("Allow token spend without approval", default OFF).
- **Responsive:** single column; countdown ring stays inline.

### [TASK-001] ProfileEdit (All Roles) (2026-06-08)
**Page:** Account · serves FR-060/061.
- **Visual:** two-column editorial form (rail = avatar uploader with drag-drop + live
  thumbnail crop; canvas = fields). Read-only fields (email, role, created date) rendered
  as mono "locked" rows with a small lock glyph. Role-specific sections appear by role
  (coach bio/credentials/public toggle; player school/jersey; parent emergency contact).
- **States:** Default · Editing (dirty indicator) · Saving (<1s target) · Photo uploading
  (progress on the avatar) · Validation error (inline).
- **Responsive:** rail stacks above canvas < 768px.

---

## Global Responsive Behavior

| Breakpoint | Behavior |
|-----------|----------|
| ≥ 1280px | Full editorial grid, 8/4 split, persistent left nav rail |
| 1024–1280 | Nav rail collapses to icons; tables keep all columns |
| 768–1024 | Tables → record cards; sheets remain side-anchored |
| < 768px | Single column; nav → bottom tab bar; context switcher + sheets → bottom sheets; availability grid → day-accordion. Touch targets ≥ 44px (NFR-007). |

## Accessibility (NFR-006 — WCAG 2.1 AA)

- Runtime contrast guard on `--brand` (auto-promote to `--brand-strong` for text on fail).
- Full keyboard paths for context switcher, availability grid (arrow-paint + range
  dialog fallback), tables, sheets (focus trap + restore).
- `prefers-reduced-motion`: disables wipes/sweeps/stripe-drift; instant state changes.
- `aria-live` for async results (login errors, save toasts, impersonation auto-exit).
- Impersonation banner `role="alert"`; never obscured; countdown announced at thresholds.
- Visible focus rings derived from `--brand` (or ink on SA chrome), ≥ 3:1 against bg.

## Open Gaps (UI impact)

| ID | Gap | UI impact |
|----|-----|-----------|
| Q-01.01 | Skill-level definitions | skill chip set on player cards/profile |
| Q-01.02 | Age-group model | child age display + availability filter labels |
| Q-01.04 | Email list | transactional email templates (out of app UI scope, note for parity) |
| Q-01.06 | Coach override notification | annotation chip on MyTimesGrid |
| Epic-08 | Camp pre-fill | RegistrationView pre-filled variant |
| Epic-05 | Payment fields | ApprovalsQueue payment detail + trainer Stripe settings UI |

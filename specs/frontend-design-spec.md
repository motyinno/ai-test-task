# Frontend Design — Design System & Components

> Living frontend specification. Read `MANIFEST.md` → `architect-architecture.md` →
> `api-designer-spec.md` first. Depends on all three.
>
> **AUTHORITATIVE TOKEN SOURCE:** `Task/designs/DESIGN_TOKENS.md` — this document is now
> aligned to it. Any conflict between this spec and `DESIGN_TOKENS.md` must be resolved
> in favour of `DESIGN_TOKENS.md`.

---

## [TASK-001] Design Foundation — "PracticePerfect" (2026-06-08)

> **NOTE:** The earlier "Editorial Athletic" aesthetic (warm paper, Clash Display/Satoshi/
> Martian Mono fonts, underline inputs, square corners, speed-rule motif) has been replaced
> by the PracticePerfect design system. Implementation is in
> `frontend/src/styles/tokens.css` and driven by the token spec below.

### Token Source

All design tokens are defined in `Task/designs/DESIGN_TOKENS.md` and implemented as CSS
custom properties in `frontend/src/styles/tokens.css`. Tailwind is configured to extend
from those CSS variables. The JS mirror is `frontend/src/styles/tokens.ts`.

### Aesthetic Direction

**PracticePerfect** — clean, neutral, system-font-based. A white-label ready platform UI
that lets the trainer's brand accent colour be the sole chromatic voice. Rounded corners
(buttons/inputs 10px, cards 16px), bordered box inputs, gradient primary buttons with
glow shadows, and a neutral grayscale palette.

**Why this direction:**
- **White-label safe (FR-054):** neutral grayscale canvas; trainer accent is the ONLY
  colour voice in their portal.
- **No custom font dependencies:** uses the system-ui / -apple-system sans stack — no
  font file loading, no FOUT, maximum compatibility.
- **Rounded, approachable:** radius scale xs(6)/sm(10)/md(16)/lg(24)/xl(32)/pill(999).
  Buttons and inputs at `radius-sm` (10px); cards at `radius-md` (16px).

---

### Typography

System sans-serif stack — no custom fonts required.

```css
--font-sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

**Scale (from `Task/designs/DESIGN_TOKENS.md` text.svg):**

| Token | Font Size | Line Height | Weight | Usage |
|-------|-----------|-------------|--------|-------|
| `hero-title` | 30px (`--text-hero`) | 38px | 700 | Page main titles |
| `section-title` | 22px (`--text-section`) | 28px | 700 | Section headers |
| `block-title` | 18px (`--text-block`) | 24px | 700 | Card/block headers |
| `card-title` | 16px (`--text-card`) | 22px | 600 | Card titles |
| `body-lg` | 16px (`--text-body-lg`) | 26px | 400 | Large body text |
| `body` | 14px (`--text-body`) | 22px | 400 | Default body text |
| `caption` | 12px (`--text-caption`) | 18px | 400 | Small text, labels |
| `eyebrow` | 11px (`--text-eyebrow`) | 16px | 600 | Uppercase labels |

---

### Color Palette & White-Label Token System

```css
/* Neutral grayscale base */
--bg:           #F3F3F3;   /* app background */
--surface:      #FFFFFF;   /* cards / sheets */
--border-soft:  #CFCFCF;   /* hairlines, dividers */
--muted:        #868686;   /* tertiary / placeholders */
--text-secondary: #5E5E5E; /* secondary text */
--text-primary:   #363636; /* primary body text */
--ink:          #0D0D0D;   /* strongest text */

/* Dynamic white-label accent */
--brand-primary:      #00B300;              /* default PracticePerfect green */
--brand-primary-soft: lighten(accent, 20%); /* for gradients, backgrounds */
--brand-primary-deep: darken(accent, 20%);  /* for gradients, shadows */
--brand-primary-rgb:  0, 179, 0;            /* for rgba() in shadows */
--brand-text:         <contrast-safe>;       /* ≥4.5:1 on --surface (NFR-006) */

/* Semantics */
--hazard:  #FF5A1F;  /* impersonation banner ONLY */
--success: #1E7A4D;
--danger:  #C42B2B;
--warning: #B7791F;
--info:    #2563A8;
```

Dark mode (`[data-theme="dark"]`) inverts the canvas tokens accordingly.

**White-label rules:**
- The trainer's `primaryColorHex` is injected as `--brand-primary` at the portal root.
- `BrandProvider` computes and sets `--brand-primary-soft`, `--brand-primary-deep`,
  `--brand-primary-rgb`, and `--brand-text` at runtime using `lightenColor()`,
  `darkenColor()`, `hexToRgb()` utilities in `frontend/src/utils/contrast.ts`.
- **Runtime WCAG contrast guard:** `resolveBrandText(brandHex, surfaceHex)` ensures
  `--brand-text` meets AA (≥4.5:1) for text on `--surface` — if the raw accent fails,
  it darkens (or lightens for dark surfaces) until compliant (NFR-006).

---

### Spacing Scale

| Token | Value | CSS Var |
|-------|-------|---------|
| xxs | 4px | `--space-xxs` |
| xs | 8px | `--space-xs` |
| sm | 12px | `--space-sm` |
| md | 16px | `--space-md` |
| lg | 24px | `--space-lg` |
| xl | 32px | `--space-xl` |
| xxl | 40px | `--space-xxl` |

---

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| xs | 6px | Small elements |
| sm | 10px | Buttons, inputs |
| md | 16px | Cards |
| lg | 24px | Large cards |
| xl | 32px | Hero sections |
| pill | 999px | Pill badges |

---

### Shadow System

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-card-soft` | `0 2px 8px rgba(0,0,0,0.2)` | Card elevation |
| `--shadow-card-strong` | `0 4px 16px rgba(0,0,0,0.3)` | Sheets / hover |
| `--shadow-btn-primary` | `0 10px 30px rgba(accent, 0.55)` | Primary button |
| `--shadow-btn-primary-hover` | `0 12px 34px rgba(accent, 0.7)` | Button hover |

---

### Component Visual Specs

#### Button
- **PRIMARY:** gradient background `linear-gradient(135deg, --brand-primary-soft, --brand-primary-deep)` + glow shadow `--shadow-btn-primary`
- **Hover:** `translateY(-1px) scale(1.02)` + `--shadow-btn-primary-hover`
- **SECONDARY:** border outline (`1px solid --brand-primary`), transparent bg
- **GHOST:** border outline (`1px solid --border-soft`), transparent bg
- **Radius:** `--radius-sm` (10px)
- **Sizes:** sm `8px / 18px`, md `10px / 24px`
- **Disabled:** opacity 0.55, cursor not-allowed, no transform

#### Input
- **Style:** bordered box (NOT underline)
- **Height:** 40px; padding: 0 10px
- **Border:** `1px solid --border-soft` → focus: `1.5px solid --brand-primary` + glow ring
- **Error:** `1.5px solid --danger`
- **Disabled:** `--bg` background, `--muted` text, opacity 0.65
- **Radius:** `--radius-sm` (10px)

#### Cards
- **Radius:** `--radius-md` (16px)
- **Shadow:** `--shadow-card-soft`

#### Form Controls (from `Task/designs/form_control_element.svg`)
- **Checkbox:** 24×24, `--radius-xs` (6px), accent fill + white check when on
- **Radio:** 22×22 circle, accent ring + dot
- **Toggle:** 39×24 capsule, accent on / `#AAAAAA` off, white knob
- Implemented in `frontend/src/components/ui/FormControls.tsx`

#### Default Logo
- `Task/designs/default_logo.svg` copied to `frontend/src/assets/default_logo.svg`
- Used as the default brand masthead in LoginPage and any logo slot
- Trainer branding can override per `BrandingResponseDto`

---

### Component Specs (unchanged behaviour, updated tokens)

#### [TASK-001] LoginPage (2026-06-08)
- **Layout:** asymmetric two-panel. Left = dark `--ink` panel with `default_logo.svg` +
  accent rule; right = form card on `--surface` with `--shadow-card-soft`.
- **Fields:** email + password, bordered inputs, gradient primary button.
- **States:** Default · Focused (accent border + glow ring) · Loading · Error · Rate-limited.

#### [TASK-001] ImpersonationBanner (2026-06-08) — SIGNATURE
- Sticky top bar, `--hazard` background, diagonal stripe texture (fixed -10deg).
- "VIEWING AS [NAME]" + live countdown. EXIT IMPERSONATION button.
- `role="alert"`, pushes content down.

#### [TASK-001] UsersTable (Super Admin)
- SA chrome uses ink/border-soft palette — no brand accent.
- Eyebrow caps column headers, `--border-soft` row rules, tabular-nums.
- Cards at `--radius-md` with `--shadow-card-soft`.

#### [TASK-001] ContextSwitcher
- Active context in display font caps. Multi-context dropdown with `--shadow-card-soft`.
- Active option: `rgba(--brand-primary-rgb, 0.08)` bg + 3px `--brand-primary` left border.

---

### Accessibility (NFR-006 — WCAG 2.1 AA)

- Runtime contrast guard on `--brand-primary` via `resolveBrandText()` (auto-promotes
  `--brand-text` for text/icon use if raw accent fails ≥4.5:1 on `--surface`).
- Full keyboard paths for context switcher, sheets (focus trap + restore).
- `prefers-reduced-motion`: disables animations; instant state changes.
- `aria-live` for async results (login errors, save toasts).
- Impersonation banner `role="alert"`.
- Visible focus rings: `2px solid --brand-primary`, `--radius-xs` offset.

---

### Global Responsive Behavior

| Breakpoint | Behavior |
|-----------|----------|
| ≥ 1280px | Full grid, persistent left nav rail |
| 1024–1280 | Nav rail collapses to icons |
| 768–1024 | Tables → record cards; sheets remain side-anchored |
| < 768px | Single column; nav → bottom tab bar; sheets → bottom sheets. Touch targets ≥ 44px (NFR-007). |

---

### Open Gaps (UI impact)

| ID | Gap | UI impact |
|----|-----|-----------|
| Q-01.01 | Skill-level definitions | skill chip set on player cards/profile |
| Q-01.02 | Age-group model | child age display + availability filter labels |
| Q-01.04 | Email list | transactional email templates |
| Q-01.06 | Coach override notification | annotation chip on MyTimesGrid |
| Epic-08 | Camp pre-fill | RegistrationView pre-filled variant |
| Epic-05 | Payment fields | ApprovalsQueue payment detail + trainer Stripe settings UI |

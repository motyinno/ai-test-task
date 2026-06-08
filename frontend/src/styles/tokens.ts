/**
 * Design token mirror — keeps JS/CSS var names in sync.
 * Values are CSS custom-property references (or raw values for non-color tokens).
 * The actual values live in tokens.css.
 */

export type TokenKeys =
  | 'paper'
  | 'surface'
  | 'ink'
  | 'ink2'
  | 'muted'
  | 'line'
  | 'brand'
  | 'brandTint'
  | 'brandStrong'
  | 'onBrand'
  | 'hazard'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'speedAngle'
  | 'shadowCard'
  | 'fontDisplay'
  | 'fontBody'
  | 'fontMono';

export const tokens: Record<TokenKeys, string> = {
  // Canvas
  paper:       'var(--paper)',
  surface:     'var(--surface)',
  ink:         'var(--ink)',
  ink2:        'var(--ink-2)',
  muted:       'var(--muted)',
  line:        'var(--line)',

  // Dynamic white-label brand
  brand:       'var(--brand)',
  brandTint:   'var(--brand-tint)',
  brandStrong: 'var(--brand-strong)',
  onBrand:     'var(--on-brand)',

  // Fixed semantics
  hazard:   'var(--hazard)',
  success:  'var(--success)',
  danger:   'var(--danger)',
  warning:  'var(--warning)',
  info:     'var(--info)',

  // Motif
  speedAngle: 'var(--speed-angle)',
  shadowCard: 'var(--shadow-card)',

  // Typography families
  fontDisplay: "'Clash Display', sans-serif",
  fontBody:    "'Satoshi', sans-serif",
  fontMono:    "'Martian Mono', monospace",
} as const;

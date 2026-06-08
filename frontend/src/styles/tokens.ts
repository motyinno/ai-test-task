/**
 * PracticePerfect Design Token mirror — keeps JS/CSS var names in sync.
 * Authoritative source: Task/designs/DESIGN_TOKENS.md
 * Values are CSS custom-property references. Actual values live in tokens.css.
 */

export type TokenKeys =
  // Canvas
  | 'bg'
  | 'surface'
  | 'borderSoft'
  | 'muted'
  | 'textSecondary'
  | 'textPrimary'
  | 'ink'
  // Brand
  | 'brandPrimary'
  | 'brandPrimarySoft'
  | 'brandPrimaryDeep'
  | 'brandText'
  // Semantics
  | 'hazard'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  // Shadows
  | 'shadowCardSoft'
  | 'shadowCardStrong'
  | 'shadowBtnPrimary'
  | 'shadowBtnPrimaryHover'
  // Typography families
  | 'fontSans'
  | 'fontBody'
  | 'fontDisplay'
  | 'fontMono';

export const tokens: Record<TokenKeys, string> = {
  // Canvas
  bg:           'var(--bg)',
  surface:      'var(--surface)',
  borderSoft:   'var(--border-soft)',
  muted:        'var(--muted)',
  textSecondary: 'var(--text-secondary)',
  textPrimary:  'var(--text-primary)',
  ink:          'var(--ink)',

  // Brand
  brandPrimary:     'var(--brand-primary)',
  brandPrimarySoft: 'var(--brand-primary-soft)',
  brandPrimaryDeep: 'var(--brand-primary-deep)',
  brandText:        'var(--brand-text)',

  // Fixed semantics
  hazard:   'var(--hazard)',
  success:  'var(--success)',
  danger:   'var(--danger)',
  warning:  'var(--warning)',
  info:     'var(--info)',

  // Shadows
  shadowCardSoft:        'var(--shadow-card-soft)',
  shadowCardStrong:      'var(--shadow-card-strong)',
  shadowBtnPrimary:      'var(--shadow-btn-primary)',
  shadowBtnPrimaryHover: 'var(--shadow-btn-primary-hover)',

  // Typography families
  fontSans:    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontBody:    'var(--font-body)',
  fontDisplay: 'var(--font-display)',
  fontMono:    "ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', Menlo, Courier, monospace",
} as const;

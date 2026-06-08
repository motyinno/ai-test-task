/**
 * PracticePerfect design token contract tests.
 * Authoritative source: Task/designs/DESIGN_TOKENS.md
 * Updated from Editorial Athletic → PracticePerfect tokens.
 */
import { tokens, type TokenKeys } from '../tokens';

describe('design tokens contract', () => {
  const requiredKeys: TokenKeys[] = [
    // Canvas / neutral grayscale
    'bg',
    'surface',
    'borderSoft',
    'muted',
    'textSecondary',
    'textPrimary',
    'ink',
    // Brand
    'brandPrimary',
    'brandPrimarySoft',
    'brandPrimaryDeep',
    'brandText',
    // Semantics
    'hazard',
    'success',
    'danger',
    'warning',
    'info',
    // Shadows
    'shadowCardSoft',
    'shadowCardStrong',
    'shadowBtnPrimary',
    'shadowBtnPrimaryHover',
    // Typography families
    'fontSans',
    'fontBody',
    'fontDisplay',
    'fontMono',
  ];

  requiredKeys.forEach((key) => {
    it(`has token "${key}"`, () => {
      expect(tokens[key]).toBeDefined();
      expect(typeof tokens[key]).toBe('string');
      expect(tokens[key].length).toBeGreaterThan(0);
    });
  });

  it('brandPrimary token references a CSS var', () => {
    expect(tokens.brandPrimary).toContain('var(--');
  });

  it('fontSans uses system sans-serif stack (no custom Fontshare fonts)', () => {
    expect(tokens.fontSans).toContain('system-ui');
    expect(tokens.fontSans).not.toContain('Clash Display');
    expect(tokens.fontSans).not.toContain('Satoshi');
    expect(tokens.fontSans).not.toContain('Martian Mono');
  });

  it('fontMono uses system monospace stack', () => {
    expect(tokens.fontMono).toMatch(/monospace|Menlo|Courier/i);
  });

  it('shadowBtnPrimary references the brand-primary-rgb for glow', () => {
    expect(tokens.shadowBtnPrimary).toContain('var(--shadow-btn-primary)');
  });

  it('surface token references CSS var for card backgrounds', () => {
    expect(tokens.surface).toContain('var(--surface)');
  });
});

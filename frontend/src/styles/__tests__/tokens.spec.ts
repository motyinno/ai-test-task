import { tokens, type TokenKeys } from '../tokens';

describe('design tokens contract', () => {
  const requiredKeys: TokenKeys[] = [
    'paper',
    'surface',
    'ink',
    'ink2',
    'muted',
    'line',
    'brand',
    'brandTint',
    'brandStrong',
    'onBrand',
    'hazard',
    'success',
    'danger',
    'warning',
    'info',
    'speedAngle',
    'fontDisplay',
    'fontBody',
    'fontMono',
  ];

  requiredKeys.forEach((key) => {
    it(`has token "${key}"`, () => {
      expect(tokens[key]).toBeDefined();
      expect(typeof tokens[key]).toBe('string');
      expect(tokens[key].length).toBeGreaterThan(0);
    });
  });

  it('brand token references a CSS var', () => {
    expect(tokens.brand).toContain('var(--');
  });

  it('fontDisplay is Clash Display', () => {
    expect(tokens.fontDisplay).toContain('Clash Display');
  });

  it('fontMono is Martian Mono', () => {
    expect(tokens.fontMono).toContain('Martian Mono');
  });
});

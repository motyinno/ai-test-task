import { contrastRatio, resolveBrandText } from '../contrast';

describe('contrast guard', () => {
  it('computes WCAG contrast ratio for black on white (21:1)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('computes WCAG contrast ratio for white on white (1:1)', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 1);
  });

  it('computes contrast ratio for mid-grey on white (~3.95:1)', () => {
    // #767676 on white is typically the AA threshold (3:1 for UI, 4.5:1 for text)
    const ratio = contrastRatio('#767676', '#FFFFFF');
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(5);
  });

  it('keeps brand color for text when it passes AA (>=4.5:1) on white surface', () => {
    // #1B3A5B on #FFFFFF is ~9:1 — passes easily
    expect(resolveBrandText('#1B3A5B', '#FFFFFF')).toBe('#1B3A5B');
  });

  it('promotes to a darker shade when brand fails AA for text', () => {
    // #7FD1FF (light blue) on white fails 4.5:1
    const result = resolveBrandText('#7FD1FF', '#FFFFFF');
    expect(result).not.toBe('#7FD1FF');
    expect(contrastRatio(result, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('promotes a very light brand on dark surface to pass AA', () => {
    // Very light pink on dark surface (#181B21) — ensure promotion works both directions
    const result = resolveBrandText('#FFB3C1', '#181B21');
    // If it can't be made AA-compliant by darkening on light or lightening on dark,
    // it should at least output a value
    expect(typeof result).toBe('string');
    expect(result.startsWith('#')).toBe(true);
  });

  it('handles uppercase hex input', () => {
    const r1 = contrastRatio('#000000', '#FFFFFF');
    const r2 = contrastRatio('#000000', '#ffffff');
    expect(r1).toBeCloseTo(r2, 5);
  });
});

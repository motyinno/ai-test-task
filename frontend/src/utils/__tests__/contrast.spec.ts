/**
 * WCAG 2.1 contrast guard tests — updated for PracticePerfect design system.
 * Default accent: #00B300 (green).
 * Authoritative source: Task/designs/DESIGN_TOKENS.md
 */
import {
  contrastRatio,
  resolveBrandText,
  hexToRgb,
  lightenColor,
  darkenColor,
} from '../contrast';

describe('contrast guard', () => {
  it('computes WCAG contrast ratio for black on white (21:1)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('computes WCAG contrast ratio for white on white (1:1)', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 1);
  });

  it('computes contrast ratio for mid-grey on white (~3.95:1)', () => {
    const ratio = contrastRatio('#767676', '#FFFFFF');
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(5);
  });

  it('resolveBrandText promotes #00B300 to AA-compliant shade on --surface #FFFFFF', () => {
    // #00B300 (green) on white has contrast ~2.82:1 — does NOT pass AA 4.5:1 for text.
    // resolveBrandText must darken it until it reaches ≥4.5:1.
    const ratio = contrastRatio('#00B300', '#FFFFFF');
    expect(ratio).toBeLessThan(4.5); // confirm it needs promotion
    const promoted = resolveBrandText('#00B300', '#FFFFFF');
    expect(promoted).not.toBe('#00B300'); // it should be a darker variant
    expect(contrastRatio(promoted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps brand-primary unchanged when it already passes AA on surface', () => {
    // #006600 (darker green) on white passes 4.5:1
    const ratio = contrastRatio('#006600', '#FFFFFF');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(resolveBrandText('#006600', '#FFFFFF')).toBe('#006600');
  });

  it('promotes to a darker shade when brand fails AA for text on light surface', () => {
    // #7FD1FF (light blue) on white fails 4.5:1
    const result = resolveBrandText('#7FD1FF', '#FFFFFF');
    expect(result).not.toBe('#7FD1FF');
    expect(contrastRatio(result, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('promotes a very light brand on dark surface (#181B21) to pass AA', () => {
    const result = resolveBrandText('#FFB3C1', '#181B21');
    expect(typeof result).toBe('string');
    expect(result.startsWith('#')).toBe(true);
  });

  it('handles uppercase hex input', () => {
    const r1 = contrastRatio('#000000', '#FFFFFF');
    const r2 = contrastRatio('#000000', '#ffffff');
    expect(r1).toBeCloseTo(r2, 5);
  });
});

describe('brand color utilities (PracticePerfect)', () => {
  describe('hexToRgb', () => {
    it('converts #00B300 to [0, 179, 0]', () => {
      expect(hexToRgb('#00B300')).toEqual([0, 179, 0]);
    });

    it('converts #FFFFFF to [255, 255, 255]', () => {
      expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255]);
    });

    it('converts #000000 to [0, 0, 0]', () => {
      expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    });

    it('handles lowercase hex', () => {
      expect(hexToRgb('#00b300')).toEqual([0, 179, 0]);
    });
  });

  describe('lightenColor (--brand-primary-soft = lighten(accent, 20%))', () => {
    it('lightens #00B300 by 20% to produce a lighter green', () => {
      const result = lightenColor('#00B300', 20);
      const [r, g, b] = hexToRgb(result);
      const [or, og, ob] = hexToRgb('#00B300');
      // Lightened: each channel moves toward 255
      expect(r).toBeGreaterThanOrEqual(or);
      expect(g).toBeGreaterThanOrEqual(og);
      expect(b).toBeGreaterThanOrEqual(ob);
    });

    it('returns #FFFFFF when lightened by 100%', () => {
      expect(lightenColor('#00B300', 100)).toBe('#ffffff');
    });

    it('returns original color when lightened by 0%', () => {
      expect(lightenColor('#00B300', 0)).toBe('#00b300');
    });
  });

  describe('darkenColor (--brand-primary-deep = darken(accent, 20%))', () => {
    it('darkens #00B300 by 20% to produce a darker green', () => {
      const result = darkenColor('#00B300', 20);
      const [r, g, b] = hexToRgb(result);
      const [or, og, ob] = hexToRgb('#00B300');
      // Darkened: each channel moves toward 0
      expect(r).toBeLessThanOrEqual(or);
      expect(g).toBeLessThanOrEqual(og);
      expect(b).toBeLessThanOrEqual(ob);
    });

    it('returns #000000 when darkened by 100%', () => {
      expect(darkenColor('#00B300', 100)).toBe('#000000');
    });

    it('returns original color when darkened by 0%', () => {
      expect(darkenColor('#00B300', 0)).toBe('#00b300');
    });
  });
});

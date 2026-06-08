/**
 * WCAG 2.1 contrast utilities.
 * Pure logic — no DOM, no side effects. Suitable for unit testing.
 */

/** Parse a 6-digit hex color to [r, g, b] in 0..255. */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').toLowerCase();
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

/** Convert a linear RGB channel (0..1) to relative luminance contribution. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2.1 formula. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * WCAG contrast ratio between two hex colors.
 * Returns a value in [1, 21].
 */
export function contrastRatio(fg: string, bg: string): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Convert [r,g,b] 0..255 to a hex string. */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Resolve a brand color that is safe to use as text on the given surface color.
 * - If the brand color already meets AA (≥4.5:1 contrast ratio), returns it unchanged.
 * - Otherwise, darken (or lighten for dark surfaces) the brand color in HSL steps
 *   until it reaches ≥4.5:1. Falls back to `#000000` / `#FFFFFF` if no shade works.
 */
export function resolveBrandText(brandHex: string, surfaceHex: string): string {
  const WCAG_AA_TEXT = 4.5;

  if (contrastRatio(brandHex, surfaceHex) >= WCAG_AA_TEXT) {
    return brandHex;
  }

  const surfaceLuminance = relativeLuminance(surfaceHex);
  const [r, g, b] = hexToRgb(brandHex);

  // Convert RGB to HSL
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
      case gn: h = ((bn - rn) / d + 2) / 6; break;
      case bn: h = ((rn - gn) / d + 4) / 6; break;
    }
  }

  function hslToRgb(hv: number, sv: number, lv: number): [number, number, number] {
    let rv: number, gv: number, bv: number;
    if (sv === 0) {
      rv = gv = bv = lv;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = lv < 0.5 ? lv * (1 + sv) : lv + sv - lv * sv;
      const p = 2 * lv - q;
      rv = hue2rgb(p, q, hv + 1/3);
      gv = hue2rgb(p, q, hv);
      bv = hue2rgb(p, q, hv - 1/3);
    }
    return [Math.round(rv * 255), Math.round(gv * 255), Math.round(bv * 255)];
  }

  // Determine direction: darken for light surfaces, lighten for dark surfaces
  const shouldDarken = surfaceLuminance > 0.5;
  const stepCount = 100;

  for (let i = 1; i <= stepCount; i++) {
    const newL = shouldDarken
      ? Math.max(0, l - (i / stepCount) * l)
      : Math.min(1, l + (i / stepCount) * (1 - l));
    const [nr, ng, nb] = hslToRgb(h, s, newL);
    const candidate = rgbToHex(nr, ng, nb);
    if (contrastRatio(candidate, surfaceHex) >= WCAG_AA_TEXT) {
      return candidate;
    }
  }

  // Fallback: absolute black or white
  return shouldDarken ? '#000000' : '#FFFFFF';
}

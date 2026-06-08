/**
 * BrandProvider — injects per-trainer CSS custom properties.
 *
 * PracticePerfect design system (Task/designs/DESIGN_TOKENS.md):
 *   --brand-primary        = raw accent hex
 *   --brand-primary-soft   = lighten(accent, 20%)  [for gradients, soft backgrounds]
 *   --brand-primary-deep   = darken(accent, 20%)   [for gradients, deep shadows]
 *   --brand-primary-rgb    = "r, g, b"             [for rgba() usage in shadows]
 *   --brand-text           = text-safe variant (≥4.5:1 on --surface, NFR-006)
 */
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { resolveBrandText, lightenColor, darkenColor, hexToRgb } from '@/utils/contrast';

interface BrandContextValue {
  /** The raw brand hex (may not be text-safe on light surfaces). */
  brandHex: string;
  /** A text-safe shade (≥4.5:1 against --surface). Used for text/icons. */
  brandTextHex: string;
  setBrand: (hex: string | null) => void;
}

const DEFAULT_BRAND = '#00B300'; // PracticePerfect default green
const SURFACE = '#FFFFFF'; // matches --surface light mode

const BrandContext = createContext<BrandContextValue>({
  brandHex: DEFAULT_BRAND,
  brandTextHex: DEFAULT_BRAND,
  setBrand: () => {},
});

interface BrandProviderProps {
  children: React.ReactNode;
  /** Element to inject CSS vars onto. Defaults to document.documentElement. */
  rootEl?: HTMLElement | null;
}

export function BrandProvider({ children, rootEl }: BrandProviderProps) {
  const [brandHex, setBrandHex] = React.useState(DEFAULT_BRAND);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    rootRef.current = rootEl ?? document.documentElement;
  }, [rootEl]);

  const brandTextHex = resolveBrandText(brandHex, SURFACE);

  useEffect(() => {
    const el = rootRef.current ?? document.documentElement;

    // Core accent
    el.style.setProperty('--brand-primary', brandHex);
    // Derived accent variants (DESIGN_TOKENS.md)
    el.style.setProperty('--brand-primary-soft', lightenColor(brandHex, 20));
    el.style.setProperty('--brand-primary-deep', darkenColor(brandHex, 20));
    // RGB components for rgba() shadow usage
    const [r, g, b] = hexToRgb(brandHex);
    el.style.setProperty('--brand-primary-rgb', `${r}, ${g}, ${b}`);
    // Text-safe variant (WCAG AA guard)
    el.style.setProperty('--brand-text', brandTextHex);
  }, [brandHex, brandTextHex]);

  const setBrand = (hex: string | null) => {
    setBrandHex(hex ?? DEFAULT_BRAND);
  };

  return (
    <BrandContext.Provider value={{ brandHex, brandTextHex, setBrand }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}

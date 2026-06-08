import React, { createContext, useContext, useEffect, useRef } from 'react';
import { resolveBrandText } from '@/utils/contrast';

interface BrandContextValue {
  /** The raw brand hex (may not be text-safe). */
  brandHex: string;
  /** A text-safe shade (≥4.5:1 against --surface). */
  brandTextHex: string;
  setBrand: (hex: string | null) => void;
}

const BrandContext = createContext<BrandContextValue>({
  brandHex: '#1B3A5B',
  brandTextHex: '#1B3A5B',
  setBrand: () => {},
});

const DEFAULT_BRAND = '#1B3A5B';
const SURFACE = '#FFFFFF'; // matches --surface light mode

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
    el.style.setProperty('--brand', brandHex);
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

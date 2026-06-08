/**
 * PracticePerfect StatNumber.
 * - Oversized stat numeral (--text-stat clamp)
 * - Count-up animation on first paint (disabled under prefers-reduced-motion)
 * - tabular-nums so layout never shifts
 * - Eyebrow UPPERCASE label below
 * - No hardcoded hex — all colors via CSS tokens
 */
import React, { useEffect, useRef, useState } from 'react';

interface StatNumberProps {
  value: number;
  label: string;
  /** Duration of count-up in ms (default 1200). Disabled under prefers-reduced-motion. */
  duration?: number;
  className?: string;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return reduced;
}

export function StatNumber({ value, label, duration = 1200, className = '' }: StatNumberProps) {
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(reducedMotion ? value : 0);
  const animationRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayValue(value);
      return;
    }

    const startValue = 0;

    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + eased * (value - startValue)));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      startRef.current = null;
    };
  }, [value, duration, reducedMotion]);

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}
    >
      <span
        aria-label={`${value} ${label}`}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-stat)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {displayValue.toLocaleString()}
      </span>
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-eyebrow)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
          color: 'var(--muted)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMe, ME_QUERY_KEY } from '@/providers/auth-provider';
import { impersonationApi } from '@/api/endpoints/impersonation';

const ONE_HOUR_MS = 60 * 60 * 1000;

interface ImpersonationBannerProps {
  /** Unix timestamp (ms) when impersonation started — used for countdown. */
  startedAt: number;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '0:00';
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Impersonation hazard banner (signature component).
 *
 * - Sticky at top, role="alert", full-bleed --hazard background
 * - Diagonal hazard-stripe texture (paused under prefers-reduced-motion)
 * - Shows "VIEWING AS [NAME] · [ROLE]" + live countdown to 1h cap
 * - EXIT IMPERSONATION button: POST /impersonation/exit, then refetch me
 * - Auto-exits when countdown hits 0
 * - Renders nothing when not impersonating
 */
export function ImpersonationBanner({ startedAt }: ImpersonationBannerProps) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const reducedMotion = useReducedMotion();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoExitedRef = useRef(false);

  const [remainingMs, setRemainingMs] = useState(() => {
    const elapsed = Date.now() - startedAt;
    return Math.max(0, ONE_HOUR_MS - elapsed);
  });

  const exitMutation = useMutation({
    mutationFn: () => impersonationApi.exit(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });

  const handleExit = useCallback(() => {
    exitMutation.mutate();
  }, [exitMutation]);

  // Countdown ticker
  useEffect(() => {
    if (!me?.impersonatedBy) return;

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, ONE_HOUR_MS - elapsed);
      setRemainingMs(remaining);

      if (remaining <= 0 && !autoExitedRef.current) {
        autoExitedRef.current = true;
        clearInterval(timerRef.current!);
        exitMutation.mutate();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.impersonatedBy, startedAt]);

  if (!me?.impersonatedBy) return null;

  const isUrgent = remainingMs < 5 * 60 * 1000; // < 5 min

  // Hazard diagonal stripe via repeating-linear-gradient
  const stripeStyle: React.CSSProperties = {
    backgroundImage: `repeating-linear-gradient(
      var(--speed-angle),
      rgba(0,0,0,0.15) 0px,
      rgba(0,0,0,0.15) 10px,
      transparent 10px,
      transparent 20px
    )`,
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'var(--hazard)',
        color: '#FFFFFF',
        ...stripeStyle,
        padding: '0.5rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        minHeight: '2.75rem',
      }}
    >
      {/* Left: status text */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-label)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <span>VIEWING AS {me.activeContext.label}</span>
        <span aria-label="Time remaining">
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              animation: isUrgent && !reducedMotion ? 'pulse 1s ease-in-out infinite' : 'none',
            }}
          >
            {formatCountdown(remainingMs)}
          </span>
        </span>
      </span>

      {/* Right: exit button */}
      <button
        onClick={handleExit}
        disabled={exitMutation.isPending}
        aria-label="Exit impersonation"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-label)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
          background: 'rgba(255,255,255,0.2)',
          color: '#FFFFFF',
          border: '1px solid rgba(255,255,255,0.5)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.25rem 0.75rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        EXIT IMPERSONATION
      </button>
    </div>
  );
}

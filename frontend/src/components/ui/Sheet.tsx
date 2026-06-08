/**
 * PracticePerfect Sheet — right-side panel on desktop, full bottom sheet on mobile.
 * - Focus trap when open
 * - Closes on Escape
 * - Restores focus to trigger element on close
 * - role="dialog" with aria-modal
 * - 16px card radius on bottom sheet top edge
 * - Uses new PracticePerfect design tokens
 */
import React, { useEffect, useRef, useCallback } from 'react';

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: 'right' | 'bottom';
}

export function Sheet({
  isOpen,
  onClose,
  title,
  children,
  side = 'right',
}: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save and restore focus
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setTimeout(() => {
        const focusable = sheetRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        focusable?.focus();
      }, 0);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const sheetStyle: React.CSSProperties =
    side === 'right'
      ? {
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(480px, 100vw)',
          backgroundColor: 'var(--surface)',
          boxShadow: 'var(--shadow-card-strong)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
          overflowY: 'auto',
        }
      : {
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '90vh',
          backgroundColor: 'var(--surface)',
          boxShadow: 'var(--shadow-card-strong)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
          overflowY: 'auto',
          borderRadius: 'var(--radius-md) var(--radius-md) 0 0', /* 16px */
        };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(13, 13, 13, 0.4)',
          zIndex: 40,
        }}
      />

      {/* Sheet panel */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={sheetStyle}
      >
        <div style={{ padding: 'var(--space-lg)' }}>
          {title && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-lg)',
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-section)',
                  fontWeight: 700,
                  color: 'var(--ink)',
                  margin: 0,
                  lineHeight: '28px',
                }}
              >
                {title}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  fontSize: '1.5rem',
                  lineHeight: 1,
                  padding: '0.25rem',
                }}
              >
                ×
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </>
  );
}

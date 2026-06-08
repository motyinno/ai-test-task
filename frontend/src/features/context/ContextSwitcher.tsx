/**
 * PracticePerfect ContextSwitcher / Masthead.
 * Updated to PracticePerfect design tokens.
 * - Active context in display font caps
 * - Multi-context: dropdown channel list with keyboard roving
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMe, ME_QUERY_KEY } from '@/providers/auth-provider';
import { playersContextApi, type ContextDto } from '@/api/endpoints/players-context';

const CONTEXTS_QUERY_KEY = ['players', 'me', 'contexts'] as const;

function groupContexts(contexts: ContextDto[], isChild: boolean) {
  if (isChild) {
    return { self: contexts, children: [] };
  }
  const self = contexts.filter((c) => c.isSelf);
  const childContexts = contexts.filter((c) => !c.isSelf);
  return { self, children: childContexts };
}

export function ContextSwitcher() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: contextsData } = useQuery({
    queryKey: CONTEXTS_QUERY_KEY,
    queryFn: () => playersContextApi.getContexts(),
    enabled: !!me,
  });

  const switchMutation = useMutation({
    mutationFn: ({ profileId, trainerId }: { profileId: string; trainerId?: string }) =>
      playersContextApi.switchContext(profileId, trainerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
      setIsOpen(false);
    },
  });

  const contexts = contextsData?.data ?? [];
  const isChild = me?.isChild ?? false;
  const { self: selfContexts, children: childContexts } = groupContexts(contexts, isChild);
  const allOptions = [...selfContexts, ...childContexts];
  const hasMultiple = allOptions.length > 1;

  const activeLabel = me?.activeContext?.label ?? '';

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, allOptions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const ctx = allOptions[focusedIndex];
        if (ctx) {
          switchMutation.mutate({ profileId: ctx.profileId, trainerId: ctx.trainerId });
        }
      }
    },
    [isOpen, allOptions, focusedIndex, switchMutation],
  );

  useEffect(() => {
    if (isOpen && listRef.current) {
      const optionEls = listRef.current.querySelectorAll<HTMLElement>('[role="option"]');
      optionEls[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  return (
    <div style={{ position: 'relative' }} onKeyDown={handleKeyDown}>
      {/* Masthead */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-section)',
            fontWeight: 700,
            color: 'var(--ink)',
            lineHeight: '28px',
          }}
        >
          {activeLabel}
        </span>

        {hasMultiple && (
          <button
            ref={triggerRef}
            onClick={() => {
              setIsOpen((o) => !o);
              setFocusedIndex(0);
            }}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label="Switch context"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted)',
              fontSize: '1rem',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg
              width="12"
              height="8"
              viewBox="0 0 12 8"
              fill="none"
              aria-hidden="true"
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
            >
              <path
                d="M1 1L6 7L11 1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Channel list dropdown */}
      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Switch training context"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            left: 0,
            minWidth: '280px',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-card-soft)',
            zIndex: 60,
            overflow: 'hidden',
          }}
        >
          {/* "Your Training" group */}
          {!isChild && selfContexts.length > 0 && (
            <div>
              <div
                style={{
                  padding: 'var(--space-xs) var(--space-sm) var(--space-xxs)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-eyebrow)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--border-soft)',
                }}
              >
                Your Training
              </div>
              {selfContexts.map((ctx, idx) => (
                <ContextOption
                  key={`self-${ctx.trainerId}`}
                  ctx={ctx}
                  isFocused={focusedIndex === idx}
                  isActive={
                    me?.activeContext?.profileId === ctx.profileId &&
                    me?.activeContext?.trainerId === ctx.trainerId
                  }
                  onSelect={() =>
                    switchMutation.mutate({
                      profileId: ctx.profileId,
                      trainerId: ctx.trainerId,
                    })
                  }
                />
              ))}
            </div>
          )}

          {/* "Your Children's Training" group */}
          {!isChild && childContexts.length > 0 && (
            <div>
              <div
                style={{
                  padding: 'var(--space-xs) var(--space-sm) var(--space-xxs)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-eyebrow)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--border-soft)',
                  borderTop: selfContexts.length > 0 ? '1px solid var(--border-soft)' : undefined,
                }}
              >
                Your Children's Training
              </div>
              {childContexts.map((ctx, idx) => (
                <ContextOption
                  key={`child-${ctx.profileId}-${ctx.trainerId}`}
                  ctx={ctx}
                  isFocused={focusedIndex === selfContexts.length + idx}
                  isActive={
                    me?.activeContext?.profileId === ctx.profileId &&
                    me?.activeContext?.trainerId === ctx.trainerId
                  }
                  onSelect={() =>
                    switchMutation.mutate({
                      profileId: ctx.profileId,
                      trainerId: ctx.trainerId,
                    })
                  }
                />
              ))}
            </div>
          )}

          {/* Child principal: their own contexts */}
          {isChild &&
            contexts.map((ctx, idx) => (
              <ContextOption
                key={`${ctx.profileId}-${ctx.trainerId}`}
                ctx={ctx}
                isFocused={focusedIndex === idx}
                isActive={
                  me?.activeContext?.profileId === ctx.profileId &&
                  me?.activeContext?.trainerId === ctx.trainerId
                }
                onSelect={() =>
                  switchMutation.mutate({
                    profileId: ctx.profileId,
                    trainerId: ctx.trainerId,
                  })
                }
              />
            ))}
        </div>
      )}
    </div>
  );
}

interface ContextOptionProps {
  ctx: ContextDto;
  isFocused: boolean;
  isActive: boolean;
  onSelect: () => void;
}

function ContextOption({ ctx, isFocused, isActive, onSelect }: ContextOptionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused) ref.current?.focus();
  }, [isFocused]);

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isActive}
      tabIndex={isFocused ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        padding: 'var(--space-sm) var(--space-md)',
        cursor: 'pointer',
        backgroundColor: isActive ? 'rgba(var(--brand-primary-rgb), 0.08)' : 'transparent',
        borderLeft: isActive
          ? '3px solid var(--brand-primary)'
          : '3px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        outline: isFocused ? '2px solid var(--brand-primary)' : 'none',
        outlineOffset: '-2px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--text-body)',
          color: 'var(--ink)',
        }}
      >
        {ctx.profileName} → {ctx.trainerName}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-eyebrow)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--muted)',
        }}
      >
        {ctx.isSelf ? 'You' : 'Child'}
      </span>
    </div>
  );
}

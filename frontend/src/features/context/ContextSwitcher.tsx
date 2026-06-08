import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMe, ME_QUERY_KEY } from '@/providers/auth-provider';
import { playersContextApi, type ContextDto } from '@/api/endpoints/players-context';

const CONTEXTS_QUERY_KEY = ['players', 'me', 'contexts'] as const;

/**
 * Groups contexts into "Your Training" (self) and "Your Children's Training" (children).
 * Child principals see only their own list (no "Me" group with isSelf grouping).
 */
function groupContexts(contexts: ContextDto[], isChild: boolean) {
  if (isChild) {
    // Child sees only their trainers — no "Me" group header
    return { self: contexts, children: [] };
  }
  const self = contexts.filter((c) => c.isSelf);
  const childContexts = contexts.filter((c) => !c.isSelf);
  return { self, children: childContexts };
}

/**
 * ContextSwitcher / Masthead (signature component).
 *
 * - Resting: active context in Clash Display caps + mono sub-label
 * - Single context: static masthead (no chevron, no expand button)
 * - Multi context: a button opens a channel-list panel
 *   - Grouped: "Your Training" (Me → trainers) + "Your Children's Training" (child → trainers)
 *   - Child principal: only their own trainers — no "Me" group
 * - Selecting: POST /players/me/context + invalidate me
 * - Keyboard: roving focus on options with ArrowDown/ArrowUp, Enter to select, Esc to close
 * - Accessible: role=listbox + role=option
 */
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

  // Keyboard roving focus
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

  // Focus the active option when list opens
  useEffect(() => {
    if (isOpen && listRef.current) {
      const optionEls = listRef.current.querySelectorAll<HTMLElement>('[role="option"]');
      optionEls[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  // Close on outside click
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
          gap: '0.75rem',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-h2)',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}
        >
          {activeLabel}
        </span>

        {/* Expand button — only when multi-context */}
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
            {/* Speed-rule chevron */}
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
              <path d="M1 1L6 7L11 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
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
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-card)',
            zIndex: 60,
            overflow: 'hidden',
          }}
        >
          {/* "Your Training" group (self contexts) */}
          {!isChild && selfContexts.length > 0 && (
            <div>
              <div
                style={{
                  padding: '0.5rem 0.75rem 0.25rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-label)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--line)',
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
                  padding: '0.5rem 0.75rem 0.25rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-label)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--line)',
                  borderTop: selfContexts.length > 0 ? '1px solid var(--line)' : undefined,
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

          {/* Child principal: just their own contexts, no group header */}
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
        padding: '0.625rem 0.75rem',
        cursor: 'pointer',
        backgroundColor: isActive ? 'var(--brand-tint)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--brand)' : '2px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.125rem',
        outline: isFocused ? '2px solid var(--brand)' : 'none',
        outlineOffset: '-2px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--text-sm)',
          textTransform: 'uppercase',
          color: 'var(--ink)',
        }}
      >
        {ctx.profileName} → {ctx.trainerName}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-label)',
          color: 'var(--muted)',
        }}
      >
        {ctx.isSelf ? 'You' : 'Child'}
      </span>
    </div>
  );
}

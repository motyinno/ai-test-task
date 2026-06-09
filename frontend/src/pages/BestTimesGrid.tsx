/**
 * FI-2 BestTimesGrid — PLAYER (parent) role.
 * Weekly day×time availability grid for a player profile.
 * Parent uses ContextSwitcher to select which child profile before editing.
 * Responsive: grid on desktop → day-accordion on mobile.
 * GET/PUT /players/:profileId/availability
 */
import React, { useState, useEffect, useReducer } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { availabilityApi, type AvailabilitySlot } from '@/api/endpoints/availability';
import { playersContextApi } from '@/api/endpoints/players-context';
import { useMe } from '@/providers/auth-provider';
import { Button } from '@/components/ui/Button';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
type Day = typeof DAYS[number];

const DAY_LABELS: Record<Day, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

// Time slots: every hour from 6am to 10pm
const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const h = i + 6;
  return `${String(h).padStart(2, '0')}:00`;
});

type SlotKey = `${Day}-${string}`;

function slotKey(day: Day, time: string): SlotKey {
  return `${day}-${time}`;
}

interface GridState {
  selected: Set<SlotKey>;
}

type GridAction =
  | { type: 'TOGGLE'; key: SlotKey }
  | { type: 'LOAD'; slots: AvailabilitySlot[] }
  | { type: 'CLEAR' };

function slotsToKeys(slots: AvailabilitySlot[]): Set<SlotKey> {
  const keys = new Set<SlotKey>();
  for (const slot of slots) {
    // Each slot is a range — expand hours within range
    const startHour = parseInt(slot.startTime.split(':')[0], 10);
    const endHour = parseInt(slot.endTime.split(':')[0], 10);
    for (let h = startHour; h < endHour; h++) {
      keys.add(slotKey(slot.dayOfWeek as Day, `${String(h).padStart(2, '0')}:00`));
    }
  }
  return keys;
}

function keysToSlots(selected: Set<SlotKey>): AvailabilitySlot[] {
  const byDay: Record<string, number[]> = {};
  for (const key of selected) {
    const [day, time] = key.split('-') as [Day, string];
    const hour = parseInt(time, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(hour);
  }

  const slots: AvailabilitySlot[] = [];
  for (const [day, hours] of Object.entries(byDay)) {
    const sortedHours = [...hours].sort((a, b) => a - b);
    // Merge consecutive hours into ranges
    let rangeStart = sortedHours[0];
    let prev = sortedHours[0];
    for (let i = 1; i < sortedHours.length; i++) {
      const h = sortedHours[i];
      if (h === prev + 1) {
        prev = h;
      } else {
        slots.push({
          dayOfWeek: day as Day,
          startTime: `${String(rangeStart).padStart(2, '0')}:00`,
          endTime: `${String(prev + 1).padStart(2, '0')}:00`,
        });
        rangeStart = h;
        prev = h;
      }
    }
    slots.push({
      dayOfWeek: day as Day,
      startTime: `${String(rangeStart).padStart(2, '0')}:00`,
      endTime: `${String(prev + 1).padStart(2, '0')}:00`,
    });
  }
  return slots;
}

function gridReducer(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case 'TOGGLE': {
      const next = new Set(state.selected);
      if (next.has(action.key)) {
        next.delete(action.key);
      } else {
        next.add(action.key);
      }
      return { selected: next };
    }
    case 'LOAD':
      return { selected: slotsToKeys(action.slots) };
    case 'CLEAR':
      return { selected: new Set<SlotKey>() };
    default:
      return state;
  }
}

// ─── Grid cell ────────────────────────────────────────────────────────────────

interface GridCellProps {
  day: Day;
  time: string;
  isSelected: boolean;
  onToggle: () => void;
}

function GridCell({ day, time, isSelected, onToggle }: GridCellProps) {
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      aria-label={`${DAY_LABELS[day]} at ${time}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{
        width: '100%',
        height: '32px',
        borderRadius: 'var(--radius-xs)',
        border: isSelected ? 'none' : '1px solid var(--border-soft)',
        backgroundColor: isSelected ? 'var(--brand-primary)' : 'var(--surface)',
        cursor: 'pointer',
        transition: reducedMotion ? 'none' : 'background-color 0.1s ease',
        outline: 'none',
      }}
    />
  );
}

// ─── Day accordion (mobile) ──────────────────────────────────────────────────

interface DayAccordionProps {
  day: Day;
  selected: Set<SlotKey>;
  onToggle: (key: SlotKey) => void;
}

function DayAccordion({ day, selected, onToggle }: DayAccordionProps) {
  const [open, setOpen] = useState(false);
  const selectedCount = TIME_SLOTS.filter((t) => selected.has(slotKey(day, t))).length;

  return (
    <div
      style={{
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        marginBottom: 'var(--space-xs)',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`accordion-${day}`}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--space-sm) var(--space-md)',
          backgroundColor: 'var(--surface)',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body)',
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        <span>{DAY_LABELS[day]}</span>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-caption)',
            color: 'var(--muted)',
          }}
        >
          {selectedCount > 0 ? `${selectedCount} slot${selectedCount > 1 ? 's' : ''}` : '—'}
        </span>
      </button>

      {open && (
        <div
          id={`accordion-${day}`}
          style={{
            padding: 'var(--space-sm) var(--space-md)',
            backgroundColor: 'var(--bg)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-xs)',
          }}
        >
          {TIME_SLOTS.map((time) => {
            const key = slotKey(day, time);
            const isSel = selected.has(key);
            return (
              <button
                key={time}
                type="button"
                role="checkbox"
                aria-checked={isSel}
                aria-label={`${DAY_LABELS[day]} at ${time}`}
                onClick={() => onToggle(key)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-xs)',
                  border: isSel ? 'none' : '1px solid var(--border-soft)',
                  backgroundColor: isSel ? 'var(--brand-primary)' : 'var(--surface)',
                  color: isSel ? '#FFFFFF' : 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-caption)',
                  cursor: 'pointer',
                }}
              >
                {time}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BestTimesGrid() {
  const { data: me } = useMe();
  const qc = useQueryClient();

  // The backend only sets activeContext after an explicit switch. On a fresh
  // session (no switch yet) it is absent — which previously left a parent with a
  // single profile stuck on the "No active profile" gate (the ContextSwitcher
  // chevron only appears when ≥2 contexts exist). To keep the screen usable we
  // fall back to the principal's available contexts, preferring their self
  // profile, then the first child profile.
  const { data: contextsData } = useQuery({
    queryKey: ['players', 'me', 'contexts'] as const,
    queryFn: () => playersContextApi.getContexts(),
    enabled: !!me && !me.activeContext?.profileId,
  });

  const fallbackContext =
    contextsData?.data.find((c) => c.isSelf) ?? contextsData?.data[0];
  const profileId = me?.activeContext?.profileId ?? fallbackContext?.profileId;

  const [state, dispatch] = useReducer(gridReducer, { selected: new Set<SlotKey>() });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const availabilityKey = ['players', profileId, 'availability'] as const;

  const { data, isLoading } = useQuery({
    queryKey: availabilityKey,
    queryFn: () => availabilityApi.getPlayerAvailability(profileId!),
    enabled: !!profileId,
  });

  useEffect(() => {
    if (data?.slots) {
      dispatch({ type: 'LOAD', slots: data.slots });
      setIsDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      availabilityApi.setPlayerAvailability(profileId!, { slots: keysToSlots(state.selected) }),
    onSuccess: (updated) => {
      qc.setQueryData(availabilityKey, updated);
      setIsDirty(false);
      setSaveMessage('Availability saved');
      setTimeout(() => setSaveMessage(null), 3000);
    },
  });

  const handleToggle = (key: SlotKey) => {
    dispatch({ type: 'TOGGLE', key });
    setIsDirty(true);
  };

  if (!profileId) {
    return (
      <main role="main" style={{ padding: 'var(--space-xl)' }}>
        <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}>
          No active profile selected. Use the context switcher in the masthead.
        </p>
      </main>
    );
  }

  return (
    <main
      role="main"
      style={{ padding: 'var(--space-xl)', backgroundColor: 'var(--bg)', minHeight: '100svh' }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 'var(--space-xl)',
          flexWrap: 'wrap',
          gap: 'var(--space-md)',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-eyebrow)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              color: 'var(--muted)',
              marginBottom: 'var(--space-xxs)',
            }}
          >
            Availability
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-hero)',
              fontWeight: 700,
              color: 'var(--ink)',
              margin: 0,
              lineHeight: '38px',
            }}
          >
            Best Times
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body)',
              color: 'var(--text-secondary)',
              marginTop: 'var(--space-xs)',
            }}
          >
            Click slots to toggle availability. Switch profiles via the masthead.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          {saveMessage && (
            <span
              aria-live="polite"
              role="status"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body)',
                color: 'var(--success)',
              }}
            >
              {saveMessage}
            </span>
          )}
          <Button
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!isDirty}
          >
            Save
          </Button>
        </div>
      </div>

      {isLoading && (
        <div role="status" aria-label="Loading availability">
          <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}>
            Loading availability…
          </span>
        </div>
      )}

      {!isLoading && (
        <>
          {/* Desktop grid — hidden below md */}
          <div
            aria-label="Availability grid"
            data-testid="availability-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: `64px repeat(${DAYS.length}, 1fr)`,
              gap: '4px',
              overflowX: 'auto',
            }}
          >
            {/* Header row */}
            <div />
            {DAYS.map((day) => (
              <div
                key={day}
                style={{
                  textAlign: 'center',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-eyebrow)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--muted)',
                  paddingBottom: '4px',
                }}
              >
                {day}
              </div>
            ))}

            {/* Time rows */}
            {TIME_SLOTS.map((time) => (
              <React.Fragment key={time}>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: '8px',
                  }}
                >
                  {time}
                </div>
                {DAYS.map((day) => {
                  const key = slotKey(day, time);
                  return (
                    <GridCell
                      key={key}
                      day={day}
                      time={time}
                      isSelected={state.selected.has(key)}
                      onToggle={() => handleToggle(key)}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Mobile accordion */}
          <div
            aria-label="Availability by day"
            data-testid="availability-accordion"
            style={{ display: 'none' }}
          >
            {DAYS.map((day) => (
              <DayAccordion
                key={day}
                day={day}
                selected={state.selected}
                onToggle={handleToggle}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

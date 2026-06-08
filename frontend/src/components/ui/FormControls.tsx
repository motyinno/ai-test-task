/**
 * PracticePerfect Form Control primitives.
 * Matches form_control_element.svg design:
 *   Checkbox: 24x24 rounded, accent fill + white check when on
 *   Radio:    accent ring + dot
 *   Toggle:   39x24 capsule, accent on / #AAAAAA off, white knob
 *
 * All colors via CSS tokens — no hardcoded hex in components.
 */
import React from 'react';

// ─── Checkbox ─────────────────────────────────────────────────────────────────

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, id, disabled }: CheckboxProps) {
  const checkId = id ?? React.useId();

  return (
    <label
      htmlFor={checkId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-xs)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        userSelect: 'none',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-body)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Hidden native checkbox for accessibility */}
      <input
        id={checkId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      {/* Visual checkbox: 24x24, 6px radius */}
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: 'var(--radius-xs)',
          border: checked ? 'none' : '1.5px solid var(--border-soft)',
          backgroundColor: checked ? 'var(--brand-primary)' : 'var(--surface)',
          transition: 'background-color 0.12s ease, border-color 0.12s ease',
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M2 7L5.5 10.5L12 3.5"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

// ─── Radio ────────────────────────────────────────────────────────────────────

interface RadioProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}

export function Radio({ checked, onChange, label, id, name, value, disabled }: RadioProps) {
  const radioId = id ?? React.useId();

  return (
    <label
      htmlFor={radioId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-xs)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        userSelect: 'none',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-body)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Hidden native radio for accessibility */}
      <input
        id={radioId}
        type="radio"
        checked={checked}
        disabled={disabled}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      {/* Visual radio circle: 22x22 */}
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: checked
            ? '2px solid var(--brand-primary)'
            : '1.5px solid var(--border-soft)',
          backgroundColor: 'var(--surface)',
          transition: 'border-color 0.12s ease',
          flexShrink: 0,
        }}
      >
        {checked && (
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: 'var(--brand-primary)',
            }}
          />
        )}
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, id, disabled }: ToggleProps) {
  const toggleId = id ?? React.useId();

  return (
    <label
      htmlFor={toggleId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-xs)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        userSelect: 'none',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-body)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Hidden native checkbox for accessibility */}
      <input
        id={toggleId}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-checked={checked}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      {/* Visual toggle capsule: 39x24 */}
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 39,
          height: 24,
          borderRadius: 'var(--radius-pill)',
          backgroundColor: checked ? 'var(--brand-primary)' : '#AAAAAA',
          transition: 'background-color 0.18s ease',
          flexShrink: 0,
        }}
      >
        {/* White knob */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 18 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            transition: 'left 0.18s ease',
          }}
        />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Editorial Athletic underline input.
 * - Hairline bottom border only (not boxed)
 * - Label lifts on focus via CSS
 * - Error state: --danger underline + aria-invalid + aria-describedby
 */
export function Input({
  label,
  error,
  hint,
  id: externalId,
  className = '',
  ...props
}: InputProps) {
  const generatedId = useId();
  const id = externalId ?? generatedId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [
    error ? errorId : null,
    hint ? hintId : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div
      className={`input-field ${className}`}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
    >
      <label
        htmlFor={id}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-label)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: error ? 'var(--danger)' : 'var(--muted)',
          userSelect: 'none',
        }}
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body)',
          color: 'var(--ink)',
          backgroundColor: 'transparent',
          border: 'none',
          borderBottom: `1px solid ${error ? 'var(--danger)' : 'var(--line)'}`,
          borderRadius: 0,
          padding: '0.5rem 0',
          outline: 'none',
          width: '100%',
          ...props.style,
        }}
      />
      {hint && !error && (
        <span
          id={hintId}
          style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}
        >
          {hint}
        </span>
      )}
      {error && (
        <span
          id={errorId}
          role="alert"
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--danger)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

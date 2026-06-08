/**
 * PracticePerfect Input component.
 * - Bordered box (not underline): 1px solid --border-soft, 10px radius
 * - Height: 40px, padding: 10px horizontal
 * - Focus: --brand-primary border + soft glow ring
 * - Error + Disabled states
 * - No hardcoded hex — all colors via CSS tokens
 */
import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Input({
  label,
  error,
  hint,
  id: externalId,
  className = '',
  disabled,
  ...props
}: InputProps) {
  const generatedId = useId();
  const id = externalId ?? generatedId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [isFocused, setIsFocused] = React.useState(false);

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') ||
    undefined;

  const inputBorder = error
    ? '1.5px solid var(--danger)'
    : isFocused
    ? '1.5px solid var(--brand-primary)'
    : '1px solid var(--border-soft)';

  const inputBoxShadow =
    !error && isFocused
      ? '0 0 0 3px rgba(var(--brand-primary-rgb), 0.18)'
      : undefined;

  return (
    <div
      className={`input-field ${className}`}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}
    >
      <label
        htmlFor={id}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-caption)',
          fontWeight: 600,
          color: error ? 'var(--danger)' : 'var(--text-secondary)',
          userSelect: 'none',
          lineHeight: '18px',
        }}
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onFocus={(e) => {
          setIsFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body)',
          color: disabled ? 'var(--muted)' : 'var(--ink)',
          backgroundColor: disabled ? 'var(--bg)' : 'var(--surface)',
          border: inputBorder,
          borderRadius: 'var(--radius-sm)', /* 10px */
          padding: '0 10px',
          height: '40px',
          outline: 'none',
          width: '100%',
          boxShadow: inputBoxShadow,
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.65 : 1,
          transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
          ...props.style,
        }}
      />
      {hint && !error && (
        <span
          id={hintId}
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--muted)',
            lineHeight: '18px',
          }}
        >
          {hint}
        </span>
      )}
      {error && (
        <span
          id={errorId}
          role="alert"
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--danger)',
            lineHeight: '18px',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Editorial Athletic Button.
 * - Primary: speed-rule sweep on hover via CSS
 * - Square-ish corners (var(--radius-md))
 * - Token-driven: uses CSS vars only, no hardcoded hex
 */
export function Button({
  loading = false,
  variant = 'primary',
  size = 'md',
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : 1,
    position: 'relative',
    overflow: 'hidden',
    transition: 'box-shadow 0.12s ease, transform 0.08s ease',
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '0.375rem 0.75rem', fontSize: 'var(--text-sm)' },
    md: { padding: '0.625rem 1.25rem', fontSize: 'var(--text-body)' },
    lg: { padding: '0.875rem 1.75rem', fontSize: 'var(--text-h3)' },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--brand)',
      color: 'var(--on-brand)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--ink)',
      border: '1px solid var(--line)',
    },
    danger: {
      backgroundColor: 'var(--danger)',
      color: '#FFFFFF',
    },
  };

  return (
    <button
      {...props}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={{ ...baseStyle, ...sizeStyles[size], ...variantStyles[variant] }}
      className={className}
    >
      {loading ? (
        <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <span
            style={{
              display: 'inline-block',
              width: '0.9em',
              height: '0.9em',
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }}
          />
          {children}
        </span>
      ) : children}
    </button>
  );
}

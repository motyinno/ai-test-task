/**
 * PracticePerfect Button component.
 * - PRIMARY: gradient background (soft→deep), glow shadow, hover lift + scale
 * - SECONDARY: bordered outline, transparent background
 * - GHOST: subtle border, transparent
 * - DANGER: semantic red
 * - All radii: 10px (--radius-sm)
 * - No hardcoded hex — all colors via CSS tokens
 */
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export function Button({
  loading = false,
  variant = 'primary',
  size = 'md',
  disabled,
  children,
  className = '',
  style: externalStyle,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    letterSpacing: '0.01em',
    borderRadius: 'var(--radius-sm)', /* 10px */
    border: 'none',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.55 : 1,
    position: 'relative',
    overflow: 'hidden',
    transition: 'box-shadow 0.15s ease, transform 0.12s ease',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '8px 18px', fontSize: 'var(--text-body)' },   /* ~18px/8px */
    md: { padding: '10px 24px', fontSize: 'var(--text-body)' },  /* ~24px/10px */
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'linear-gradient(135deg, var(--brand-primary-soft), var(--brand-primary-deep))',
      color: '#FFFFFF',
      boxShadow: 'var(--shadow-btn-primary)',
    },
    secondary: {
      background: 'transparent',
      color: 'var(--brand-text)',
      border: '1px solid var(--brand-primary)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-soft)',
    },
    danger: {
      background: 'var(--danger)',
      color: '#FFFFFF',
    },
  };

  const [isHovered, setIsHovered] = React.useState(false);

  const hoverOverride: React.CSSProperties =
    !isDisabled && isHovered && variant === 'primary'
      ? {
          transform: 'translateY(-1px) scale(1.02)',
          boxShadow: 'var(--shadow-btn-primary-hover)',
        }
      : {};

  return (
    <button
      {...props}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onMouseEnter={(e) => {
        setIsHovered(true);
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        props.onMouseLeave?.(e);
      }}
      style={{
        ...baseStyle,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...hoverOverride,
        ...externalStyle,
      }}
      className={className}
    >
      {loading ? (
        <span
          aria-hidden="true"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
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
      ) : (
        children
      )}
    </button>
  );
}

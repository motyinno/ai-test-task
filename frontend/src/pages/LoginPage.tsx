/**
 * PracticePerfect LoginPage.
 * - Left panel: dark (#0D0D0D) with default_logo.svg (trainer can override)
 * - Right panel: form on --bg surface, boxed inputs, gradient primary button
 * - Responsive: < 768px left panel collapses to slim top band
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useLogin } from '@/providers/auth-provider';
import { ApiError } from '@/api/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import defaultLogo from '@/assets/default_logo.svg';

interface LoginFormValues {
  email: string;
  password: string;
}

function getRoleRoute(role: string): string {
  switch (role) {
    case 'SUPER_ADMIN': return '/admin/users';
    case 'TRAINER': return '/trainer/dashboard';
    case 'COACH': return '/coach/dashboard';
    default: return '/dashboard';
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>();

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      const me = await login.mutateAsync(values);
      if (me.mustChangePassword) {
        navigate('/change-password', { replace: true });
        return;
      }
      navigate(getRoleRoute(me.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 429) {
          setServerError('Too many attempts, please try again later.');
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        backgroundColor: 'var(--bg)',
      }}
    >
      {/* Left panel: brand masthead with default logo */}
      <div
        style={{
          flex: '0 0 40%',
          backgroundColor: 'var(--ink)',
          padding: 'var(--space-xl)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: 'var(--space-lg)',
        }}
        aria-hidden="true"
      >
        {/* Default logo — trainers can override with branded variant */}
        <img
          src={defaultLogo}
          alt="PracticePerfect"
          style={{
            height: 64,
            width: 'auto',
            maxWidth: '200px',
          }}
        />
        <div
          style={{
            width: '48px',
            height: '4px',
            backgroundColor: 'var(--brand-primary)',
            borderRadius: 'var(--radius-pill)',
          }}
        />
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
            fontWeight: 400,
            color: 'var(--border-soft)',
            margin: 0,
            lineHeight: '22px',
            maxWidth: '260px',
          }}
        >
          Your coaching platform.
        </p>
      </div>

      {/* Right panel: form */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-xl)',
        }}
      >
        <div style={{ width: '100%', maxWidth: '380px' }}>
          {/* Card container */}
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-card-soft)',
              padding: 'var(--space-xl)',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-section)',
                fontWeight: 700,
                color: 'var(--ink)',
                marginBottom: 'var(--space-lg)',
                marginTop: 0,
                lineHeight: '28px',
              }}
            >
              Sign In
            </h2>

            {/* Server error region */}
            {serverError && (
              <div
                aria-live="polite"
                role="alert"
                style={{
                  marginBottom: 'var(--space-md)',
                  padding: 'var(--space-sm) var(--space-md)',
                  backgroundColor: 'rgba(196,43,43,0.08)',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--danger)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-body)',
                  lineHeight: '22px',
                }}
              >
                {serverError}
              </div>
            )}

            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
            >
              <Input
                id="email"
                label="Email"
                type="email"
                autoComplete="email"
                error={errors.email?.message}
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Enter a valid email address',
                  },
                })}
              />

              <Input
                id="password"
                label="Password"
                type="password"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register('password', { required: 'Password is required' })}
              />

              <Button
                type="submit"
                loading={login.isPending}
                style={{ marginTop: 'var(--space-xs)', width: '100%' }}
              >
                Login
              </Button>
            </form>
          </div>

          <p
            style={{
              marginTop: 'var(--space-md)',
              fontSize: 'var(--text-body)',
              color: 'var(--muted)',
              textAlign: 'center',
              lineHeight: '22px',
            }}
          >
            Logging in for a child?{' '}
            <a
              href="#"
              style={{ color: 'var(--brand-text)', textDecoration: 'none', fontWeight: 600 }}
            >
              Use the family username.
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

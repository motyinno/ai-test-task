import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useLogin } from '@/providers/auth-provider';
import { ApiError } from '@/api/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

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
        backgroundColor: 'var(--paper)',
      }}
    >
      {/* Left panel: editorial masthead */}
      <div
        style={{
          flex: '0 0 40%',
          backgroundColor: 'var(--ink)',
          padding: '3rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
        aria-hidden="true"
      >
        <div
          style={{
            width: '48px',
            height: '4px',
            backgroundColor: 'var(--brand)',
            marginBottom: '1.5rem',
            transform: `skewX(var(--speed-angle))`,
          }}
        />
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-h1)',
            fontWeight: 700,
            color: 'var(--surface)',
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          Accelerator
        </h1>
      </div>

      {/* Right panel: form */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div style={{ width: '100%', maxWidth: '360px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-h2)',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--ink)',
              marginBottom: '2rem',
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
                marginBottom: '1rem',
                padding: '0.75rem',
                backgroundColor: 'rgba(196,43,43,0.08)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--danger)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
              }}
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
              style={{ marginTop: '0.5rem' }}
            >
              Login
            </Button>
          </form>

          <p
            style={{
              marginTop: '1.5rem',
              fontSize: 'var(--text-sm)',
              color: 'var(--muted)',
            }}
          >
            Logging in for a child?{' '}
            <a
              href="#"
              style={{ color: 'var(--brand)', textDecoration: 'none' }}
            >
              Use the family username.
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

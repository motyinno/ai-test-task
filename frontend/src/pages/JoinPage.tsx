/**
 * PracticePerfect Join page (via ShareLink).
 * Updated to PracticePerfect design tokens.
 */
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { sharelinksApi, type JoinViaLinkDto } from '@/api/endpoints/sharelinks';
import { ApiError } from '@/api/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface JoinFormValues {
  name: string;
  email: string;
  password: string;
}

type PageState = 'form' | 'child-blocked' | 'success';

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const [pageState, setPageState] = useState<PageState>('form');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: preview, isLoading, isError } = useQuery({
    queryKey: ['sharelinks', 'validate', code],
    queryFn: () => sharelinksApi.validate(code!),
    retry: false,
    enabled: !!code,
  });

  const { register, handleSubmit, formState: { errors } } = useForm<JoinFormValues>();

  const onSubmit = async (values: JoinFormValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const dto: JoinViaLinkDto = {
        name: values.name,
        email: values.email,
        password: values.password,
      };
      await sharelinksApi.join(code!, dto);
      setPageState('success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.errorCode === 'CHILD_SHARELINK_BLOCKED') {
          setPageState('child-blocked');
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError('An unexpected error occurred.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main
        role="main"
        style={{
          minHeight: '100svh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span role="status" aria-label="Loading">Loading…</span>
      </main>
    );
  }

  // Invalid / expired / revoked link
  if (isError || (preview && !preview.valid)) {
    return (
      <main
        role="main"
        style={{
          minHeight: '100svh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-xl)',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-section)',
              fontWeight: 700,
              color: 'var(--ink)',
              lineHeight: '28px',
            }}
          >
            This Link's No Longer Active
          </h1>
          <p style={{ color: 'var(--muted)', marginTop: 'var(--space-md)', fontSize: 'var(--text-body)' }}>
            This invitation link has expired or been revoked. Please contact your trainer for a new link.
          </p>
        </div>
      </main>
    );
  }

  if (pageState === 'child-blocked') {
    return (
      <main
        role="main"
        style={{
          minHeight: '100svh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-xl)',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-section)',
              fontWeight: 700,
              color: 'var(--ink)',
              lineHeight: '28px',
            }}
          >
            Ask a Parent
          </h1>
          <p style={{ color: 'var(--muted)', marginTop: 'var(--space-md)', fontSize: 'var(--text-body)' }}>
            This invite needs to be accepted by a parent or guardian. We've sent them an email to complete the process.
          </p>
        </div>
      </main>
    );
  }

  if (pageState === 'success') {
    return (
      <main
        role="main"
        style={{
          minHeight: '100svh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-xl)',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-section)',
              fontWeight: 700,
              color: 'var(--ink)',
              lineHeight: '28px',
            }}
          >
            Welcome!
          </h1>
          <p style={{ color: 'var(--muted)', marginTop: 'var(--space-md)', fontSize: 'var(--text-body)' }}>
            You're now connected with {preview?.trainerName ?? 'your trainer'}.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      role="main"
      style={{
        minHeight: '100svh',
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'var(--space-xxl) var(--space-lg)',
      }}
    >
      {/* Masthead */}
      <header style={{ marginBottom: 'var(--space-xxl)', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-eyebrow)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
            color: 'var(--muted)',
            marginBottom: 'var(--space-xs)',
          }}
        >
          You're invited
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
          JOIN {preview?.trainerName?.toUpperCase() ?? 'YOUR TRAINER'}
        </h1>
        {/* Brand accent rule */}
        <div
          aria-hidden="true"
          style={{
            width: '40px',
            height: '3px',
            backgroundColor: 'var(--brand-primary)',
            margin: 'var(--space-sm) auto 0',
            borderRadius: 'var(--radius-pill)',
          }}
        />
      </header>

      <div style={{ width: '100%', maxWidth: '400px' }}>
        {serverError && (
          <div
            aria-live="polite"
            role="alert"
            style={{
              marginBottom: 'var(--space-md)',
              padding: 'var(--space-sm) var(--space-md)',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-body)',
              fontFamily: 'var(--font-body)',
              backgroundColor: 'rgba(196,43,43,0.06)',
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
            id="name"
            label="Full Name"
            autoComplete="name"
            error={errors.name?.message}
            {...register('name', { required: 'Name is required' })}
          />
          <Input
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' },
            })}
          />
          <Input
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            hint="At least 8 characters"
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'At least 8 characters' },
            })}
          />
          <Button type="submit" loading={submitting} style={{ width: '100%' }}>
            Join
          </Button>
        </form>
      </div>
    </main>
  );
}

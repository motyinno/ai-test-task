/**
 * Invitation acceptance page (/join-invite/:token).
 * A newly-invited account (e.g. a trainer created by a Super Admin) lands here
 * from their invite email, sets a password, and the account is activated.
 */
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { invitationApi } from '@/api/endpoints/invitation';
import { ApiError } from '@/api/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface InviteFormValues {
  password: string;
  confirmPassword: string;
}

function CenteredMessage({ title, children }: { title: string; children: React.ReactNode }) {
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
          {title}
        </h1>
        <div style={{ color: 'var(--muted)', marginTop: 'var(--space-md)', fontSize: 'var(--text-body)' }}>
          {children}
        </div>
      </div>
    </main>
  );
}

export default function JoinInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const { data: preview, isLoading, isError } = useQuery({
    queryKey: ['invite', 'preview', token],
    queryFn: () => invitationApi.preview(token!),
    retry: false,
    enabled: !!token,
  });

  const { register, handleSubmit, watch, formState: { errors } } = useForm<InviteFormValues>();

  const acceptMutation = useMutation({
    mutationFn: (password: string) => invitationApi.accept({ token: token!, password }),
    onSuccess: () => setAccepted(true),
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : 'Could not activate your account. Please try again.');
    },
  });

  const onSubmit = (values: InviteFormValues) => {
    setServerError(null);
    acceptMutation.mutate(values.password);
  };

  if (isLoading) {
    return (
      <main
        role="main"
        style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <span role="status" aria-label="Loading">Loading…</span>
      </main>
    );
  }

  if (isError || (preview && !preview.valid)) {
    return (
      <CenteredMessage title="This Invite Is No Longer Active">
        This invitation link has expired or already been used. Please ask whoever invited you for a new one.
      </CenteredMessage>
    );
  }

  if (accepted) {
    return (
      <CenteredMessage title="You're all set!">
        <p>Your account is now active. You can sign in with your email and new password.</p>
        <Link
          to="/login"
          style={{
            display: 'inline-block',
            marginTop: 'var(--space-lg)',
            color: 'var(--brand-text)',
            fontWeight: 600,
            textDecoration: 'underline',
          }}
        >
          Go to sign in
        </Link>
      </CenteredMessage>
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
        justifyContent: 'center',
        padding: 'var(--space-xxl) var(--space-lg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <header style={{ marginBottom: 'var(--space-xl)', textAlign: 'center' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-section)',
              fontWeight: 700,
              color: 'var(--ink)',
              lineHeight: '28px',
            }}
          >
            Set your password
          </h1>
          <p style={{ color: 'var(--muted)', marginTop: 'var(--space-sm)', fontSize: 'var(--text-body)' }}>
            Create a password to activate your account
            {preview?.email ? <> for <strong style={{ color: 'var(--ink)' }}>{preview.email}</strong></> : null}.
          </p>
        </header>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
        >
          {serverError && (
            <div
              aria-live="polite"
              role="alert"
              style={{
                padding: 'var(--space-sm) var(--space-md)',
                color: 'var(--danger)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body)',
                backgroundColor: 'rgba(196,43,43,0.06)',
              }}
            >
              {serverError}
            </div>
          )}

          <Input
            id="invitePassword"
            label="Password"
            type="password"
            error={errors.password?.message}
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Use at least 8 characters' },
            })}
          />
          <Input
            id="inviteConfirmPassword"
            label="Confirm password"
            type="password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (v) => v === watch('password') || 'Passwords do not match',
            })}
          />

          <Button type="submit" loading={acceptMutation.isPending} style={{ width: '100%' }}>
            Activate account
          </Button>
        </form>
      </div>
    </main>
  );
}

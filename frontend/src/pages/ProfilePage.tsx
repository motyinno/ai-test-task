import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { profileApi, type UpdateProfileDto } from '@/api/endpoints/profile';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useMe } from '@/providers/auth-provider';

const PROFILE_QUERY_KEY = ['profile', 'me'] as const;

interface ProfileFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  // Coach
  bio: string;
  credentials: string;
  publicProfile: boolean;
  // Player
  school: string;
  jerseyNumber: string;
  // Parent
  emergencyContact: string;
}

export default function ProfilePage() {
  const { data: me } = useMe();
  const role = me?.role ?? 'PLAYER';
  const qc = useQueryClient();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: profileApi.get,
  });

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ProfileFormValues>();

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      reset({
        firstName: profile.firstName ?? '',
        lastName: profile.lastName ?? '',
        phone: profile.phone ?? '',
        bio: profile.bio ?? '',
        credentials: profile.credentials ?? '',
        publicProfile: profile.publicProfile ?? false,
        school: profile.school ?? '',
        jerseyNumber: profile.jerseyNumber ?? '',
        emergencyContact: profile.emergencyContact ?? '',
      });
    }
  }, [profile, reset]);

  const updateMutation = useMutation({
    mutationFn: (dto: UpdateProfileDto) => profileApi.update(dto),
    onSuccess: (updated) => {
      qc.setQueryData(PROFILE_QUERY_KEY, updated);
      setSaveMessage('Profile updated');
      setTimeout(() => setSaveMessage(null), 3000);
    },
  });

  const onSubmit = (values: ProfileFormValues) => {
    const dto: UpdateProfileDto = {
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
      phone: values.phone || undefined,
    };
    if (role === 'COACH') {
      dto.bio = values.bio || undefined;
      dto.credentials = values.credentials || undefined;
      dto.publicProfile = values.publicProfile;
    }
    if (role === 'PLAYER') {
      dto.school = values.school || undefined;
      dto.jerseyNumber = values.jerseyNumber || undefined;
    }
    if (role === 'PLAYER' && !me?.isChild) {
      // parent emergency contact
      dto.emergencyContact = values.emergencyContact || undefined;
    }
    updateMutation.mutate(dto);
  };

  if (isLoading) {
    return (
      <main role="main" style={{ padding: '2rem' }}>
        <span role="status" aria-label="Loading profile">Loading…</span>
      </main>
    );
  }

  return (
    <main role="main" style={{ padding: '2rem', backgroundColor: 'var(--paper)', minHeight: '100svh' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-h1)',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--ink)',
            marginBottom: '2rem',
          }}
        >
          Profile
        </h1>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '3rem',
          }}
        >
          {/* Left rail: avatar + read-only info */}
          <div>
            {/* Avatar placeholder */}
            <div
              style={{
                width: '100%',
                aspectRatio: '1',
                maxWidth: '160px',
                backgroundColor: 'var(--line)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.5rem',
              }}
              aria-label="Profile photo"
            >
              {profile?.photoUrl ? (
                <img
                  src={profile.photoUrl}
                  alt="Profile"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                />
              ) : (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-label)', color: 'var(--muted)' }}>
                  NO PHOTO
                </span>
              )}
            </div>

            {/* Read-only locked rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-label)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--muted)',
                    marginBottom: '0.125rem',
                  }}
                >
                  Email
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--ink-2)',
                  }}
                  aria-label="Email (read-only)"
                >
                  {profile?.email ?? '—'}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-label)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--muted)',
                    marginBottom: '0.125rem',
                  }}
                >
                  Role
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--ink-2)',
                  }}
                >
                  {role}
                </div>
              </div>
            </div>
          </div>

          {/* Right canvas: editable fields */}
          <div>
            {saveMessage && (
              <div
                aria-live="polite"
                role="status"
                style={{
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  backgroundColor: 'rgba(30,122,77,0.08)',
                  border: '1px solid var(--success)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--success)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {saveMessage}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Input
                  id="firstName"
                  label="First Name"
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Input
                  id="lastName"
                  label="Last Name"
                  {...register('lastName')}
                />
              </div>

              <Input
                id="phone"
                label="Phone"
                type="tel"
                {...register('phone')}
              />

              {/* Coach-specific fields */}
              {role === 'COACH' && (
                <>
                  <div>
                    <label
                      htmlFor="bio"
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-label)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'var(--muted)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      Bio
                    </label>
                    <textarea
                      id="bio"
                      rows={4}
                      style={{
                        width: '100%',
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-body)',
                        color: 'var(--ink)',
                        backgroundColor: 'transparent',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.5rem',
                        resize: 'vertical',
                      }}
                      {...register('bio')}
                    />
                  </div>
                  <Input
                    id="credentials"
                    label="Credentials"
                    {...register('credentials')}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="publicProfile"
                      {...register('publicProfile')}
                    />
                    <label
                      htmlFor="publicProfile"
                      style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--ink)' }}
                    >
                      Public profile
                    </label>
                  </div>
                </>
              )}

              {/* Player-specific fields */}
              {role === 'PLAYER' && (
                <>
                  <Input
                    id="school"
                    label="School"
                    {...register('school')}
                  />
                  <Input
                    id="jerseyNumber"
                    label="Jersey Number"
                    {...register('jerseyNumber')}
                  />
                </>
              )}

              {/* Parent emergency contact */}
              {role === 'PLAYER' && !me?.isChild && (
                <Input
                  id="emergencyContact"
                  label="Emergency Contact"
                  {...register('emergencyContact')}
                />
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="submit"
                  loading={updateMutation.isPending}
                  disabled={!isDirty}
                >
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * PracticePerfect Profile page.
 * Updated to use PracticePerfect design tokens.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { profileApi, type UpdateProfileDto, type SkillLevel } from '@/api/endpoints/profile';
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
  skillLevel: SkillLevel | '';
  // Parent
  emergencyContact: string;
}

export default function ProfilePage() {
  const { data: me } = useMe();
  const role = me?.role ?? 'PLAYER';
  // Super Admin has no role-specific profile, so name/phone/photo have nowhere to
  // persist. Show their account as read-only rather than letting them "save" no-ops.
  const canEditProfile = role !== 'SUPER_ADMIN';
  const qc = useQueryClient();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: profileApi.get,
  });

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ProfileFormValues>();

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
        skillLevel: profile.skillLevel ?? '',
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoMutation = useMutation({
    mutationFn: (file: File) => profileApi.uploadPhoto(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      setSaveMessage('Photo updated');
      setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (err) => {
      setSaveMessage(err instanceof Error ? err.message : 'Photo upload failed');
      setTimeout(() => setSaveMessage(null), 4000);
    },
  });

  const onPhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) photoMutation.mutate(file);
    e.target.value = ''; // allow re-selecting the same file
  };

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
      dto.skillLevel = (values.skillLevel || undefined) as SkillLevel | undefined;
    }
    if (role === 'PLAYER' && !me?.isChild) {
      dto.emergencyContact = values.emergencyContact || undefined;
    }
    updateMutation.mutate(dto);
  };

  if (isLoading) {
    return (
      <main role="main" style={{ padding: 'var(--space-xl)' }}>
        <span role="status" aria-label="Loading profile">Loading…</span>
      </main>
    );
  }

  return (
    <main
      role="main"
      style={{ padding: 'var(--space-xl)', backgroundColor: 'var(--bg)', minHeight: '100svh' }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-hero)',
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 'var(--space-xl)',
            lineHeight: '38px',
          }}
        >
          Profile
        </h1>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: 'var(--space-xl)',
          }}
        >
          {/* Left rail: avatar + read-only info */}
          <div>
            <div
              style={{
                width: '100%',
                aspectRatio: '1',
                maxWidth: '160px',
                backgroundColor: 'var(--border-soft)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 'var(--space-lg)',
              }}
              aria-label="Profile photo"
            >
              {profile?.photoUrl ? (
                <img
                  src={profile.photoUrl}
                  alt="Profile"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: 'inherit',
                  }}
                />
              ) : (
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-eyebrow)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--muted)',
                  }}
                >
                  NO PHOTO
                </span>
              )}
            </div>

            {/* Photo upload — Super Admin has no profile to store a photo */}
            {canEditProfile && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={onPhotoSelected}
                  style={{ display: 'none' }}
                  aria-hidden="true"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoMutation.isPending}
                  style={{ width: '100%', maxWidth: '160px', marginBottom: 'var(--space-lg)' }}
                >
                  {photoMutation.isPending
                    ? 'Uploading…'
                    : profile?.photoUrl
                      ? 'Change photo'
                      : 'Upload photo'}
                </Button>
              </>
            )}

            {/* Read-only locked rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-eyebrow)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    marginBottom: '2px',
                  }}
                >
                  Email
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-body)',
                    color: 'var(--text-secondary)',
                  }}
                  aria-label="Email (read-only)"
                >
                  {profile?.email ?? '—'}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-eyebrow)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    marginBottom: '2px',
                  }}
                >
                  Role
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-body)',
                    color: 'var(--text-secondary)',
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
                  marginBottom: 'var(--space-md)',
                  padding: 'var(--space-sm) var(--space-md)',
                  backgroundColor: 'rgba(30,122,77,0.08)',
                  border: '1px solid var(--success)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--success)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-body)',
                }}
              >
                {saveMessage}
              </div>
            )}

            {!canEditProfile && (
              <p
                role="note"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-body)',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-md)',
                }}
              >
                Super Admin accounts have no editable profile fields. Your email and
                role are shown for reference.
              </p>
            )}

            {canEditProfile && (
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-md)',
                }}
              >
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

              <Input id="phone" label="Phone" type="tel" {...register('phone')} />

              {role === 'COACH' && (
                <>
                  <div>
                    <label
                      htmlFor="bio"
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-caption)',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        marginBottom: '0.375rem',
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
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 'var(--space-xs) 10px',
                        resize: 'vertical',
                        outline: 'none',
                      }}
                      {...register('bio')}
                    />
                  </div>
                  <Input
                    id="credentials"
                    label="Credentials"
                    {...register('credentials')}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                    <input type="checkbox" id="publicProfile" {...register('publicProfile')} />
                    <label
                      htmlFor="publicProfile"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-body)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Public profile
                    </label>
                  </div>
                </>
              )}

              {role === 'PLAYER' && (
                <>
                  <Input id="school" label="School" {...register('school')} />
                  <Input
                    id="jerseyNumber"
                    label="Jersey Number"
                    {...register('jerseyNumber')}
                  />
                  {/* Q-01.01: Skill level select */}
                  <div>
                    <label
                      htmlFor="skillLevel"
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-caption)',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        marginBottom: '0.375rem',
                      }}
                    >
                      Skill Level
                    </label>
                    <select
                      id="skillLevel"
                      {...register('skillLevel')}
                      style={{
                        width: '100%',
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-body)',
                        color: 'var(--text-primary)',
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0 10px',
                        height: '40px',
                        outline: 'none',
                      }}
                    >
                      <option value="">Select skill level</option>
                      <option value="BEGINNER">Beginner</option>
                      <option value="INTERMEDIATE">Intermediate</option>
                      <option value="ADVANCED">Advanced</option>
                      <option value="ELITE">Elite</option>
                    </select>
                  </div>
                  {/* Q-01.02: Age + age group display (read-only, derived by backend) */}
                  {(profile?.age !== undefined || profile?.ageGroup) && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--space-md)',
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-body)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {profile?.age !== undefined && (
                        <span>
                          Age: <strong style={{ color: 'var(--text-primary)' }}>{profile.age}</strong>
                        </span>
                      )}
                      {profile?.ageGroup && (
                        <span>
                          Group:{' '}
                          <strong
                            style={{
                              color: 'var(--brand-text)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              fontSize: 'var(--text-eyebrow)',
                              letterSpacing: '0.05em',
                            }}
                          >
                            {profile.ageGroup}
                          </strong>
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}

              {role === 'PLAYER' && !me?.isChild && (
                <Input
                  id="emergencyContact"
                  label="Emergency Contact"
                  {...register('emergencyContact')}
                />
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" loading={updateMutation.isPending} disabled={!isDirty}>
                  Save
                </Button>
              </div>
            </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

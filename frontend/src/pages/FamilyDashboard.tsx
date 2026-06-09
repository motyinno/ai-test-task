/**
 * FI-1 FamilyDashboard — PLAYER (parent) role.
 * Lists children as player cards with skill-level chips + age/age-group labels.
 * Add child (dateOfBirth, age 1–18 validated client-side).
 * Add / remove child↔trainer associations.
 * Q-01.01: SkillLevel chips (BEGINNER/INTERMEDIATE/ADVANCED/ELITE)
 * Q-01.02: dateOfBirth input (not age integer); derived age + ageGroup displayed
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  familyApi,
  type ChildProfileResponse,
  type CreateChildDto,
  type SkillLevel,
} from '@/api/endpoints/family';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { ApiError } from '@/api/errors';

const CHILDREN_QUERY_KEY = ['players', 'me', 'children'] as const;

// ─── Skill-level chip (Q-01.01) ──────────────────────────────────────────────

const SKILL_COLORS: Record<SkillLevel, { bg: string; color: string }> = {
  BEGINNER:     { bg: 'rgba(37,99,168,0.1)',  color: 'var(--info)' },
  INTERMEDIATE: { bg: 'rgba(183,121,31,0.1)', color: 'var(--warning)' },
  ADVANCED:     { bg: 'rgba(30,122,77,0.1)',  color: 'var(--success)' },
  ELITE:        { bg: 'rgba(0,179,0,0.12)',   color: 'var(--brand-text)' },
};

function SkillChip({ level }: { level: SkillLevel }) {
  const { bg, color } = SKILL_COLORS[level];
  return (
    <span
      aria-label={`Skill level: ${level.toLowerCase()}`}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        backgroundColor: bg,
        color,
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-eyebrow)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {level}
    </span>
  );
}

// ─── Player card ─────────────────────────────────────────────────────────────

interface PlayerCardProps {
  child: ChildProfileResponse;
  onAddTrainer: (child: ChildProfileResponse) => void;
  onRemoveTrainer: (childId: string, trainerId: string, trainerName: string) => void;
}

function PlayerCard({ child, onAddTrainer, onRemoveTrainer }: PlayerCardProps) {
  return (
    <article
      aria-label={`Player card for ${child.name}`}
      style={{
        backgroundColor: 'var(--surface)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card-soft)',
        border: '1px solid var(--border-soft)',
        padding: 'var(--space-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-sm)',
      }}
    >
      {/* Name + skill chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-block)',
            fontWeight: 700,
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          {child.name}
        </h2>
        {child.skillLevel && <SkillChip level={child.skillLevel} />}
      </div>

      {/* Age + age group (Q-01.02) */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-md)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-caption)',
          color: 'var(--text-secondary)',
        }}
      >
        <span>Age: <strong style={{ color: 'var(--text-primary)' }}>{child.age}</strong></span>
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
            {child.ageGroup}
          </strong>
        </span>
        {child.school && <span>School: {child.school}</span>}
      </div>

      {/* Trainers */}
      <div>
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
          Trainers
        </div>
        {child.trainers.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body)',
              color: 'var(--muted)',
              margin: 0,
            }}
          >
            No trainers yet
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-xxs)' }}>
            {child.trainers.map((t) => (
              <li
                key={t.trainerId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-body)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {t.trainerName}
                </span>
                <button
                  onClick={() => onRemoveTrainer(child.id, t.trainerId, t.trainerName)}
                  aria-label={`Remove trainer ${t.trainerName}`}
                  style={{
                    background: 'none',
                    border: '1px solid var(--danger)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '2px 8px',
                    color: 'var(--danger)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-eyebrow)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginTop: 'var(--space-xs)' }}>
        <Button size="sm" variant="secondary" onClick={() => onAddTrainer(child)}>
          Add Trainer
        </Button>
      </div>
    </article>
  );
}

// ─── Add child form ───────────────────────────────────────────────────────────

interface AddChildFormValues {
  name: string;
  dateOfBirth: string;
  gender: string;
  school?: string;
}

/** Client-side validate derived age is in [1, 18]. */
function validateAge(dob: string): string | true {
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return 'Invalid date';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  if (age < 1) return 'Player must be at least 1 year old';
  if (age > 18) return 'Player must be 18 or younger';
  return true;
}

// ─── Add trainer form ─────────────────────────────────────────────────────────

interface AddTrainerFormValues {
  trainerId?: string;
  shareLinkCode?: string;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FamilyDashboard() {
  const qc = useQueryClient();
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  const [addChildError, setAddChildError] = useState<string | null>(null);
  const [addTrainerTarget, setAddTrainerTarget] = useState<ChildProfileResponse | null>(null);
  const [addTrainerError, setAddTrainerError] = useState<string | null>(null);

  // Remove trainer confirmation
  const [removeConfirm, setRemoveConfirm] = useState<{
    childId: string;
    trainerId: string;
    trainerName: string;
  } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: CHILDREN_QUERY_KEY,
    queryFn: familyApi.listChildren,
  });

  const addChildMutation = useMutation({
    mutationFn: (dto: CreateChildDto) => familyApi.createChild(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHILDREN_QUERY_KEY });
      setIsAddChildOpen(false);
      setAddChildError(null);
      addChildForm.reset();
    },
    onError: (err) => {
      setAddChildError(err instanceof ApiError ? err.message : 'Failed to create child profile');
    },
  });

  const addTrainerMutation = useMutation({
    mutationFn: ({ childId, dto }: { childId: string; dto: AddTrainerFormValues }) =>
      familyApi.addTrainer(childId, { trainerId: dto.trainerId, shareLinkCode: dto.shareLinkCode }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHILDREN_QUERY_KEY });
      setAddTrainerTarget(null);
      setAddTrainerError(null);
      addTrainerForm.reset();
    },
    onError: (err) => {
      setAddTrainerError(err instanceof ApiError ? err.message : 'Failed to add trainer');
    },
  });

  const removeTrainerMutation = useMutation({
    mutationFn: ({ childId, trainerId }: { childId: string; trainerId: string }) =>
      familyApi.removeTrainer(childId, trainerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHILDREN_QUERY_KEY });
      setRemoveConfirm(null);
    },
  });

  const addChildForm = useForm<AddChildFormValues>();
  const addTrainerForm = useForm<AddTrainerFormValues>();

  const onAddChild = (values: AddChildFormValues) => {
    setAddChildError(null);
    addChildMutation.mutate({
      name: values.name,
      dateOfBirth: values.dateOfBirth,
      gender: values.gender as 'MALE' | 'FEMALE' | 'OTHER',
      school: values.school || undefined,
    });
  };

  const onAddTrainer = (values: AddTrainerFormValues) => {
    if (!addTrainerTarget) return;
    setAddTrainerError(null);
    addTrainerMutation.mutate({ childId: addTrainerTarget.id, dto: values });
  };

  const children = data?.data ?? [];

  return (
    <main
      role="main"
      style={{
        padding: 'var(--space-xl)',
        backgroundColor: 'var(--bg)',
        minHeight: '100svh',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 'var(--space-xl)',
          flexWrap: 'wrap',
          gap: 'var(--space-md)',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-eyebrow)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              color: 'var(--muted)',
              marginBottom: 'var(--space-xxs)',
            }}
          >
            Family
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
            My Players
          </h1>
        </div>
        <Button onClick={() => { setIsAddChildOpen(true); setAddChildError(null); addChildForm.reset(); }}>
          Add Player
        </Button>
      </div>

      {/* Loading / error / empty */}
      {isLoading && (
        <div role="status" aria-label="Loading players" style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}>
          Loading players…
        </div>
      )}
      {isError && (
        <div role="alert" aria-live="assertive" style={{ color: 'var(--danger)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}>
          Failed to load players
        </div>
      )}
      {!isLoading && !isError && children.length === 0 && (
        <div
          data-testid="empty-state"
          style={{
            textAlign: 'center',
            padding: 'var(--space-xxl)',
            color: 'var(--muted)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
          }}
        >
          No players yet. Add your first player to get started.
        </div>
      )}

      {/* Player cards grid */}
      {children.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 'var(--space-lg)',
          }}
        >
          {children.map((child) => (
            <PlayerCard
              key={child.id}
              child={child}
              onAddTrainer={setAddTrainerTarget}
              onRemoveTrainer={(childId, trainerId, trainerName) =>
                setRemoveConfirm({ childId, trainerId, trainerName })
              }
            />
          ))}
        </div>
      )}

      {/* Remove trainer confirmation dialog */}
      {removeConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-confirm-title"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.4)',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-card-strong)',
              padding: 'var(--space-xl)',
              maxWidth: '400px',
              width: '90%',
            }}
          >
            <h2
              id="remove-confirm-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-block)',
                fontWeight: 700,
                color: 'var(--ink)',
                margin: '0 0 var(--space-md)',
              }}
            >
              Remove Trainer
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body)',
                color: 'var(--text-primary)',
                marginBottom: 'var(--space-lg)',
              }}
            >
              Remove <strong>{removeConfirm.trainerName}</strong> from this player? This will cancel upcoming RSVPs.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setRemoveConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={removeTrainerMutation.isPending}
                onClick={() =>
                  removeTrainerMutation.mutate({
                    childId: removeConfirm.childId,
                    trainerId: removeConfirm.trainerId,
                  })
                }
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Child Sheet */}
      <Sheet isOpen={isAddChildOpen} onClose={() => setIsAddChildOpen(false)} title="Add Player">
        <form
          onSubmit={addChildForm.handleSubmit(onAddChild)}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
        >
          {addChildError && (
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
              {addChildError}
            </div>
          )}
          <Input
            id="childName"
            label="Player Name"
            error={addChildForm.formState.errors.name?.message}
            {...addChildForm.register('name', { required: 'Name is required' })}
          />
          <Input
            id="childDob"
            label="Date of Birth"
            type="date"
            error={addChildForm.formState.errors.dateOfBirth?.message}
            {...addChildForm.register('dateOfBirth', {
              required: 'Date of birth is required',
              validate: validateAge,
            })}
          />
          <div>
            <label
              htmlFor="childGender"
              style={{
                display: 'block',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-caption)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.375rem',
              }}
            >
              Gender
            </label>
            <select
              id="childGender"
              {...addChildForm.register('gender', { required: 'Gender is required' })}
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
              <option value="">Select gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
            {addChildForm.formState.errors.gender && (
              <span
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--danger)',
                }}
              >
                {addChildForm.formState.errors.gender.message}
              </span>
            )}
          </div>
          <Input
            id="childSchool"
            label="School (optional)"
            {...addChildForm.register('school')}
          />
          <Button
            type="submit"
            loading={addChildMutation.isPending}
            style={{ width: '100%' }}
          >
            Add Player
          </Button>
        </form>
      </Sheet>

      {/* Add Trainer Sheet */}
      <Sheet
        isOpen={!!addTrainerTarget}
        onClose={() => { setAddTrainerTarget(null); setAddTrainerError(null); }}
        title={`Add Trainer to ${addTrainerTarget?.name ?? ''}`}
      >
        <form
          onSubmit={addTrainerForm.handleSubmit(onAddTrainer)}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
        >
          {addTrainerError && (
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
              {addTrainerError}
            </div>
          )}
          <Input
            id="addTrainerId"
            label="Trainer ID (UUID)"
            {...addTrainerForm.register('trainerId')}
          />
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-caption)',
              color: 'var(--muted)',
              textAlign: 'center',
            }}
          >
            — or —
          </div>
          <Input
            id="addTrainerCode"
            label="Share Link Code"
            {...addTrainerForm.register('shareLinkCode')}
          />
          <Button
            type="submit"
            loading={addTrainerMutation.isPending}
            style={{ width: '100%' }}
          >
            Add Trainer
          </Button>
        </form>
      </Sheet>
    </main>
  );
}

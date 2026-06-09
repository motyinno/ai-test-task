/**
 * FI-4 ApprovalsQueue — PLAYER (parent) role.
 * - Pending approval cards with paymentType (USD/TOKEN) chip + 48h countdown ring
 * - approve/deny actions
 * - per-child token toggle (PATCH /players/me/children/:childId/token-setting)
 * - auto-approved token spends in a muted "FYI" section
 * - prefers-reduced-motion: countdown ring animation disabled
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  approvalsApi,
  type ApprovalRequestDto,
  type PaymentType,
  type ApprovalStatus,
} from '@/api/endpoints/approvals';
import { familyApi } from '@/api/endpoints/family';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/FormControls';
import { ApiError } from '@/api/errors';

const APPROVALS_KEY = ['approvals'] as const;

/**
 * Human-readable label for the player on an approval. The list DTO omits the
 * child's name, so degrade gracefully rather than rendering "undefined" in
 * visible text or aria-labels.
 */
function approvalChildLabel(a: { childName?: string; childProfileId: string }): string {
  if (a.childName) return a.childName;
  if (a.childProfileId) return `Player ${a.childProfileId}`;
  return 'this player';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);
  return reduced;
}

/** Compute hours remaining until 48h deadline from createdAt. */
function hoursRemaining(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const deadline = created + 48 * 60 * 60 * 1000;
  const remaining = (deadline - Date.now()) / (1000 * 60 * 60);
  return Math.max(0, remaining);
}

/** 48h countdown ring SVG. */
function CountdownRing({
  createdAt,
  reducedMotion,
}: {
  createdAt: string;
  reducedMotion: boolean;
}) {
  const [hours, setHours] = useState(() => hoursRemaining(createdAt));

  useEffect(() => {
    if (reducedMotion) return;
    const interval = setInterval(() => {
      setHours(hoursRemaining(createdAt));
    }, 60_000);
    return () => clearInterval(interval);
  }, [createdAt, reducedMotion]);

  const size = 48;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, hours / 48));
  const dashOffset = circumference * (1 - fraction);

  const isUrgent = hours < 6;
  const ringColor = isUrgent ? 'var(--danger)' : 'var(--brand-primary)';

  return (
    <div
      aria-label={`${Math.round(hours)} hours remaining`}
      role="img"
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-soft)"
          strokeWidth="4"
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={reducedMotion ? 0 : dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: reducedMotion ? 'none' : 'stroke-dashoffset 1s linear',
          }}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-body)',
          fontSize: '10px',
          fontWeight: 700,
          color: ringColor,
          lineHeight: 1,
        }}
      >
        {Math.round(hours)}h
      </span>
    </div>
  );
}

// ─── Payment type chip ────────────────────────────────────────────────────────

function PaymentChip({ type }: { type: PaymentType }) {
  const isToken = type === 'TOKEN';
  return (
    <span
      aria-label={`Payment type: ${type}`}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        backgroundColor: isToken ? 'rgba(0,179,0,0.10)' : 'rgba(37,99,168,0.10)',
        color: isToken ? 'var(--brand-text)' : 'var(--info)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-eyebrow)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {type}
    </span>
  );
}

// ─── Pending card ─────────────────────────────────────────────────────────────

interface ApprovalCardProps {
  approval: ApprovalRequestDto;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  approving: boolean;
  denying: boolean;
  reducedMotion: boolean;
}

function ApprovalCard({
  approval,
  onApprove,
  onDeny,
  approving,
  denying,
  reducedMotion,
}: ApprovalCardProps) {
  const childLabel = approvalChildLabel(approval);
  return (
    <article
      aria-label={`Approval request for ${childLabel}`}
      style={{
        backgroundColor: 'var(--surface)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card-soft)',
        border: '1px solid var(--border-soft)',
        padding: 'var(--space-lg)',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 'var(--space-md)',
          gap: 'var(--space-sm)',
        }}
      >
        <div style={{ flex: 1 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-block)',
              fontWeight: 700,
              color: 'var(--ink)',
              margin: '0 0 var(--space-xxs)',
            }}
          >
            {childLabel}
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body)',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            {approval.eventRef}
          </p>
        </div>
        {approval.expiresAt && (
          <CountdownRing createdAt={approval.createdAt} reducedMotion={reducedMotion} />
        )}
      </div>

      {/* Amount + payment type */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-md)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-section)',
            fontWeight: 700,
            color: 'var(--ink)',
          }}
        >
          {approval.paymentType === 'USD'
            ? `$${Number(approval.amount).toFixed(2)}`
            : `${approval.amount} tokens`}
        </span>
        <PaymentChip type={approval.paymentType} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <Button
          size="sm"
          variant="primary"
          loading={approving}
          disabled={denying}
          onClick={() => onApprove(approval.id)}
          aria-label={`Approve request for ${childLabel}`}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="danger"
          loading={denying}
          disabled={approving}
          onClick={() => onDeny(approval.id)}
          aria-label={`Deny request for ${childLabel}`}
        >
          Deny
        </Button>
      </div>
    </article>
  );
}

// ─── Auto-approved FYI card ───────────────────────────────────────────────────

function FyiCard({ approval }: { approval: ApprovalRequestDto }) {
  const childLabel = approvalChildLabel(approval);
  return (
    <article
      aria-label={`Auto-approved spend for ${childLabel}`}
      style={{
        backgroundColor: 'var(--bg)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-soft)',
        padding: 'var(--space-md) var(--space-lg)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        opacity: 0.75,
      }}
    >
      <div>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
            color: 'var(--text-secondary)',
          }}
        >
          {childLabel} — {approval.eventRef}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
            color: 'var(--muted)',
          }}
        >
          {approval.amount} tokens
        </span>
        <PaymentChip type={approval.paymentType} />
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-eyebrow)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--success)',
          }}
        >
          AUTO
        </span>
      </div>
    </article>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ApprovalsQueue() {
  const qc = useQueryClient();
  const reducedMotion = useReducedMotion();
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<{
    id: string;
    type: 'approve' | 'deny';
  } | null>(null);

  // Token toggle state per child
  const [tokenToggles, setTokenToggles] = useState<Record<string, boolean>>({});
  const [tokenError, setTokenError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: APPROVALS_KEY,
    queryFn: () => approvalsApi.list({ limit: 50 }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: APPROVALS_KEY });
      setActiveAction(null);
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Action failed');
      setActiveAction(null);
    },
  });

  const denyMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.deny(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: APPROVALS_KEY });
      setActiveAction(null);
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Action failed');
      setActiveAction(null);
    },
  });

  const tokenSettingMutation = useMutation({
    mutationFn: ({ childId, allow }: { childId: string; allow: boolean }) =>
      familyApi.updateTokenSetting(childId, { allowTokenSpendWithoutApproval: allow }),
    onSuccess: (_, { childId, allow }) => {
      setTokenToggles((prev) => ({ ...prev, [childId]: allow }));
      setTokenError(null);
    },
    onError: (err) => {
      setTokenError(err instanceof ApiError ? err.message : 'Failed to update token setting');
    },
  });

  const allApprovals = data?.data ?? [];
  const pending = allApprovals.filter((a) => a.status === 'PENDING');
  const autoApproved = allApprovals.filter((a) => a.autoApproved && a.status === 'APPROVED');

  // Collect unique children from pending approvals for token toggle UI
  const childrenFromPending = pending.reduce<Record<string, string>>((acc, a) => {
    if (!acc[a.childProfileId]) acc[a.childProfileId] = approvalChildLabel(a);
    return acc;
  }, {});

  return (
    <main
      role="main"
      style={{ padding: 'var(--space-xl)', backgroundColor: 'var(--bg)', minHeight: '100svh' }}
    >
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
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
          Approvals
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
          Pending Approvals
        </h1>
      </div>

      {/* Error */}
      {actionError && (
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
            marginBottom: 'var(--space-md)',
          }}
        >
          {actionError}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div role="status" aria-label="Loading approvals">
          <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}>
            Loading approvals…
          </span>
        </div>
      )}

      {/* API error */}
      {isError && (
        <div role="alert" aria-live="assertive" style={{ color: 'var(--danger)' }}>
          Failed to load approvals
        </div>
      )}

      {/* Per-child token toggles */}
      {Object.keys(childrenFromPending).length > 0 && (
        <section
          aria-labelledby="token-settings-heading"
          style={{
            backgroundColor: 'var(--surface)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-card-soft)',
            border: '1px solid var(--border-soft)',
            padding: 'var(--space-md) var(--space-lg)',
            marginBottom: 'var(--space-lg)',
          }}
        >
          <h2
            id="token-settings-heading"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-eyebrow)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              color: 'var(--muted)',
              marginBottom: 'var(--space-sm)',
            }}
          >
            Token Settings
          </h2>
          {tokenError && (
            <div
              aria-live="polite"
              style={{ color: 'var(--danger)', fontSize: 'var(--text-body)', marginBottom: 'var(--space-xs)' }}
            >
              {tokenError}
            </div>
          )}
          {Object.entries(childrenFromPending).map(([childId, childName]) => (
            <div
              key={childId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-xs) 0',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-body)',
                  color: 'var(--text-primary)',
                }}
              >
                {childName}
              </span>
              <Toggle
                id={`token-toggle-${childId}`}
                checked={tokenToggles[childId] ?? false}
                label="Auto-approve tokens"
                onChange={(checked) => {
                  tokenSettingMutation.mutate({ childId, allow: checked });
                }}
              />
            </div>
          ))}
        </section>
      )}

      {/* Pending approvals */}
      {!isLoading && !isError && (
        <>
          {pending.length === 0 ? (
            <div
              data-testid="empty-pending"
              style={{
                textAlign: 'center',
                padding: 'var(--space-xxl)',
                color: 'var(--muted)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body)',
              }}
            >
              No pending approvals. You're all caught up!
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 'var(--space-lg)',
                marginBottom: 'var(--space-xl)',
              }}
            >
              {pending.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onApprove={(id) => {
                    setActiveAction({ id, type: 'approve' });
                    approveMutation.mutate(id);
                  }}
                  onDeny={(id) => {
                    setActiveAction({ id, type: 'deny' });
                    denyMutation.mutate(id);
                  }}
                  approving={
                    activeAction?.id === approval.id &&
                    activeAction.type === 'approve' &&
                    approveMutation.isPending
                  }
                  denying={
                    activeAction?.id === approval.id &&
                    activeAction.type === 'deny' &&
                    denyMutation.isPending
                  }
                  reducedMotion={reducedMotion}
                />
              ))}
            </div>
          )}

          {/* FYI section: auto-approved token spends */}
          {autoApproved.length > 0 && (
            <section aria-labelledby="fyi-heading">
              <h2
                id="fyi-heading"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-eyebrow)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  marginBottom: 'var(--space-md)',
                }}
              >
                FYI — Auto-Approved
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                {autoApproved.map((approval) => (
                  <FyiCard key={approval.id} approval={approval} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

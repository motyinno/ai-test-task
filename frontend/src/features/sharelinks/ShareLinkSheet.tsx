import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatNumber } from '@/components/ui/StatNumber';
import { sharelinksApi, type ShareLinkDto } from '@/api/endpoints/sharelinks';

const LINKS_QUERY_KEY = ['sharelinks'] as const;

interface ShareLinkSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

type LinkType = 'STATIC' | 'UNIQUE';

export function ShareLinkSheet({ isOpen, onClose }: ShareLinkSheetProps) {
  const [activeType, setActiveType] = useState<LinkType>('STATIC');
  const [targetEmail, setTargetEmail] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: LINKS_QUERY_KEY,
    queryFn: () => sharelinksApi.list(),
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: (dto: { type: LinkType; targetEmail?: string }) =>
      sharelinksApi.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LINKS_QUERY_KEY });
      setTargetEmail('');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => sharelinksApi.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LINKS_QUERY_KEY });
    },
  });

  const links = (data?.data ?? []) as ShareLinkDto[];
  const activeTypeLinks = links.filter((l) => l.type === activeType);
  // Explicit boolean comparison to avoid string "false" coercion issues
  const activeLink = activeTypeLinks.find((l) => l.active === true);
  const revokedLinks = activeTypeLinks.filter((l) => l.active !== true);

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const handleCreate = () => {
    createMutation.mutate({
      type: activeType,
      targetEmail: activeType === 'UNIQUE' ? targetEmail : undefined,
    });
  };

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Share Links">
      {/* Type switcher */}
      <div
        role="group"
        aria-label="Link type"
        style={{
          display: 'flex',
          gap: '0.25rem',
          marginBottom: '1.5rem',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.25rem',
          backgroundColor: 'var(--paper)',
        }}
      >
        {(['STATIC', 'UNIQUE'] as LinkType[]).map((type) => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            aria-pressed={activeType === type}
            aria-label={type}
            style={{
              flex: 1,
              padding: '0.5rem',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-label)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              backgroundColor: activeType === type ? 'var(--ink)' : 'transparent',
              color: activeType === type ? 'var(--surface)' : 'var(--muted)',
              border: 'none',
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              cursor: 'pointer',
            }}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Type description */}
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--muted)',
          marginBottom: '1.5rem',
        }}
      >
        {activeType === 'STATIC'
          ? 'Persistent link for players — unlimited uses, no expiry.'
          : 'Single-use link for a specific coach — expires in 7 days.'}
      </p>

      {isLoading ? (
        <div aria-busy="true" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
          Loading…
        </div>
      ) : activeLink ? (
        /* Active link display */
        <div
          style={{
            backgroundColor: 'var(--paper)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          {/* Mono code */}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-h3)',
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '0.08em',
              marginBottom: '0.75rem',
            }}
          >
            {copiedCode === activeLink.code ? 'COPIED' : activeLink.code}
          </div>

          {/* Link URL */}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--muted)',
              wordBreak: 'break-all',
              marginBottom: '1rem',
            }}
          >
            {activeLink.url}
          </div>

          {/* Usage stat */}
          {activeType === 'STATIC' && (
            <div style={{ marginBottom: '1rem' }}>
              <StatNumber value={activeLink.useCount} label="Uses" />
            </div>
          )}

          {/* Unique link metadata */}
          {activeType === 'UNIQUE' && activeLink.targetEmail && (
            <div style={{ marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--ink-2)' }}>
              Sent to: {activeLink.targetEmail}
              {activeLink.expiresAt && (
                <span style={{ marginLeft: '0.5rem', color: 'var(--muted)' }}>
                  · expires {new Date(activeLink.expiresAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(activeLink.code)}
              aria-label={copiedCode === activeLink.code ? 'Copied' : 'Copy code'}
            >
              {copiedCode === activeLink.code ? 'Copied' : 'Copy'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => revokeMutation.mutate(activeLink.id)}
              style={{ color: 'var(--danger)' }}
              aria-label="Revoke this link"
            >
              Revoke
            </Button>
          </div>
        </div>
      ) : (
        /* No active link — create form */
        <div style={{ marginBottom: '1.5rem' }}>
          {/* Show revoked notice if prior links exist */}
          {revokedLinks.length > 0 && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'rgba(138,141,150,0.1)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--muted)',
                textDecoration: 'line-through',
              }}
            >
              REVOKED · {revokedLinks[0].code}
              {revokedLinks.length > 1 && ` (+${revokedLinks.length - 1} more)`}
            </div>
          )}
          {activeType === 'UNIQUE' && (
            <div style={{ marginBottom: '1rem' }}>
              <Input
                id="targetEmail"
                label="Recipient Email"
                type="email"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
              />
            </div>
          )}
          <Button
            onClick={handleCreate}
            loading={createMutation.isPending}
            disabled={activeType === 'UNIQUE' && !targetEmail}
          >
            {activeType === 'STATIC' ? 'Generate Link' : 'Create Invite Link'}
          </Button>
        </div>
      )}

      {/* Revoked links history */}
      {revokedLinks.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-label)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--muted)',
              marginBottom: '0.5rem',
              borderTop: '1px solid var(--line)',
              paddingTop: '1rem',
            }}
          >
            Revoked
          </div>
          {revokedLinks.map((link) => (
            <div
              key={link.id}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--muted)',
                textDecoration: 'line-through',
                padding: '0.25rem 0',
              }}
            >
              REVOKED · {link.code}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

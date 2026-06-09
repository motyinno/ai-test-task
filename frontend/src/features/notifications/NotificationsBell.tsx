/**
 * NotificationsBell — lightweight in-app notifications indicator.
 * Shows unread count badge; click to open a popover with notification list.
 * Marks notifications as read on click.
 * Relevant for Q-01.06: coach receives AVAILABILITY_OVERRIDE notifications.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type Notification } from '@/api/endpoints/notifications';

const NOTIFICATIONS_KEY = ['notifications'] as const;

export function NotificationsBell() {
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { data } = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: notificationsApi.list,
    refetchInterval: 30_000, // poll every 30s
    staleTime: 15_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: (updated) => {
      qc.setQueryData(NOTIFICATIONS_KEY, (old: { data: Notification[] } | undefined) => {
        if (!old) return old;
        return {
          data: old.data.map((n) => (n.id === updated.id ? updated : n)),
        };
      });
    },
  });

  const notifications = data?.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => setIsOpen((o) => !o)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          padding: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          borderRadius: 'var(--radius-xs)',
        }}
      >
        {/* Bell icon */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 2a6 6 0 0 0-6 6v2l-1.5 2.5a.5.5 0 0 0 .5.5h14a.5.5 0 0 0 .5-.5L16 10V8a6 6 0 0 0-6-6z" />
          <path d="M8 15a2 2 0 0 0 4 0" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '16px',
              height: '16px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'var(--danger)',
              color: '#FFFFFF',
              fontFamily: 'var(--font-body)',
              fontSize: '9px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          aria-modal="false"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            right: 0,
            width: '320px',
            maxHeight: '400px',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-card-strong)',
            zIndex: 60,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              padding: 'var(--space-md) var(--space-lg)',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-card)',
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              Notifications
            </span>
            {unreadCount > 0 && (
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-eyebrow)',
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                {unreadCount} unread
              </span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div
              style={{
                padding: 'var(--space-xl)',
                textAlign: 'center',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body)',
                color: 'var(--muted)',
              }}
            >
              No notifications
            </div>
          ) : (
            <div
              role="log"
              aria-live="polite"
              aria-label="Notification list"
            >
              {notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: 'var(--space-sm) var(--space-lg)',
                    borderBottom: '1px solid var(--border-soft)',
                    backgroundColor: n.read ? 'transparent' : 'rgba(var(--brand-primary-rgb), 0.05)',
                    cursor: n.read ? 'default' : 'pointer',
                  }}
                  onClick={() => {
                    if (!n.read) markReadMutation.mutate(n.id);
                  }}
                  role={n.read ? undefined : 'button'}
                  tabIndex={n.read ? undefined : 0}
                  onKeyDown={(e) => {
                    if (!n.read && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      markReadMutation.mutate(n.id);
                    }
                  }}
                  aria-label={n.read ? undefined : `Mark as read: ${n.title}`}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-body)',
                      fontWeight: n.read ? 400 : 600,
                      color: 'var(--ink)',
                      marginBottom: '2px',
                    }}
                  >
                    {n.title}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-caption)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {n.body}
                  </div>
                  {n.type === 'AVAILABILITY_OVERRIDE' && (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: '4px',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-pill)',
                        backgroundColor: 'rgba(183,121,31,0.1)',
                        color: 'var(--warning)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Override
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

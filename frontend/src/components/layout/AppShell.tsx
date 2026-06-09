/**
 * AppShell: outer layout wrapper.
 * Hosts:
 * - ImpersonationBanner (hazard bar when impersonating)
 * - Top masthead with ContextSwitcher, NotificationsBell, nav links
 * - Main content area
 * Nav items are role-sensitive (shown based on user role).
 */
import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useMe, useLogout } from '@/providers/auth-provider';
import { ImpersonationBannerSlot } from '@/features/impersonation/ImpersonationBanner';
import { ContextSwitcher } from '@/features/context/ContextSwitcher';
import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { Button } from '@/components/ui/Button';

interface NavItem {
  label: string;
  to: string;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Profile', to: '/profile', roles: ['SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER'] },
  { label: 'Users', to: '/admin/users', roles: ['SUPER_ADMIN'] },
  { label: 'My Players', to: '/family', roles: ['PLAYER'] },
  { label: 'Best Times', to: '/availability/player', roles: ['PLAYER'] },
  { label: 'My Times', to: '/availability/coach', roles: ['COACH'] },
  { label: 'Approvals', to: '/approvals', roles: ['PLAYER'] },
  { label: 'Branding', to: '/branding', roles: ['TRAINER'] },
];

const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body)',
  fontWeight: isActive ? 600 : 400,
  color: isActive ? 'var(--brand-text)' : 'var(--text-secondary)',
  textDecoration: 'none',
  padding: '6px 0',
  borderBottom: isActive ? '2px solid var(--brand-primary)' : '2px solid transparent',
  transition: 'color 0.12s ease, border-color 0.12s ease',
});

export function AppShell() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const role = me?.role ?? '';

  const visibleNavItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => navigate('/login'),
    });
  };

  return (
    <div className="app-shell" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      {/* Impersonation banner (renders nothing when not impersonating) */}
      <ImpersonationBannerSlot />

      {/* Masthead */}
      {me && (
        <header
          role="banner"
          style={{
            backgroundColor: 'var(--surface)',
            borderBottom: '1px solid var(--border-soft)',
            padding: '0 var(--space-xl)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-lg)',
            minHeight: '56px',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          {/* Context switcher / active context */}
          <div style={{ flex: 1 }}>
            <ContextSwitcher />
          </div>

          {/* Nav links (desktop) */}
          <nav
            aria-label="Main navigation"
            style={{
              display: 'flex',
              gap: 'var(--space-lg)',
              alignItems: 'center',
            }}
          >
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={navLinkStyle}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right rail: notifications + logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <NotificationsBell />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleLogout}
              loading={logout.isPending}
            >
              Sign out
            </Button>
          </div>
        </header>
      )}

      {/* Main content */}
      <main role="main" style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}

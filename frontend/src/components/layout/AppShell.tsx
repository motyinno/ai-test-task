import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * AppShell: outer layout wrapper.
 * Hosts the masthead, impersonation banner slot, and main content area.
 * Nav rail (desktop) / bottom tab bar (mobile) is rendered here.
 */
export function AppShell() {
  return (
    <div className="app-shell" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      {/* Impersonation banner slot — rendered by ImpersonationBanner when active */}
      <div id="impersonation-banner-slot" />

      {/* Main navigation masthead is provided by pages/layout that include it */}

      <main role="main" style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}

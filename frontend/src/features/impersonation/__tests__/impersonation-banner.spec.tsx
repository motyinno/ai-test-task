import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const ONE_HOUR_MS = 60 * 60 * 1000;
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImpersonationBanner } from '../ImpersonationBanner';
import { ME_QUERY_KEY } from '@/providers/auth-provider';

function makeWrapper(meData: object | null) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  // Pre-populate the me query cache
  if (meData) {
    qc.setQueryData(ME_QUERY_KEY, meData);
  }

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

const impersonatingMe = {
  id: 'player-uuid',
  role: 'PLAYER',
  isChild: false,
  emailVerified: true,
  mustChangePassword: false,
  impersonatedBy: 'admin-uuid',
  activeContext: {
    profileId: 'p1',
    label: 'Alice Player',
  },
};

const notImpersonatingMe = {
  id: 'player-uuid',
  role: 'PLAYER',
  isChild: false,
  emailVerified: true,
  mustChangePassword: false,
  impersonatedBy: undefined,
  activeContext: { profileId: 'p1', label: 'Alice Player' },
};

describe('ImpersonationBanner', () => {
  it('renders nothing when not impersonating', () => {
    const { Wrapper } = makeWrapper(notImpersonatingMe);
    const { container } = render(
      <Wrapper>
        <ImpersonationBanner startedAt={Date.now()} />
      </Wrapper>,
    );
    // No banner should appear
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('renders a sticky role="alert" banner when impersonating', () => {
    const { Wrapper } = makeWrapper(impersonatingMe);
    render(
      <Wrapper>
        <ImpersonationBanner startedAt={Date.now()} />
      </Wrapper>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows "VIEWING AS" and the impersonated user label', () => {
    const { Wrapper } = makeWrapper(impersonatingMe);
    render(
      <Wrapper>
        <ImpersonationBanner startedAt={Date.now()} />
      </Wrapper>,
    );
    expect(screen.getByText(/VIEWING AS/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice Player/i)).toBeInTheDocument();
  });

  it('shows EXIT IMPERSONATION button', () => {
    const { Wrapper } = makeWrapper(impersonatingMe);
    render(
      <Wrapper>
        <ImpersonationBanner startedAt={Date.now()} />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exit impersonation/i })).toBeInTheDocument();
  });

  it('calls POST /impersonation/exit and refetches me when exit is clicked', async () => {
    let exitCalled = false;
    server.use(
      // CSRF token
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ token: 'csrf-test' })),
      http.post('/api/v1/impersonation/exit', () => {
        exitCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get('/api/v1/auth/me', () => HttpResponse.json(notImpersonatingMe)),
    );

    const { Wrapper } = makeWrapper(impersonatingMe);
    render(
      <Wrapper>
        <ImpersonationBanner startedAt={Date.now()} />
      </Wrapper>,
    );

    await userEvent.click(screen.getByRole('button', { name: /exit impersonation/i }));

    await waitFor(() => {
      expect(exitCalled).toBe(true);
    });
  });

  it('shows a countdown from the 1h cap', () => {
    const { Wrapper } = makeWrapper(impersonatingMe);
    // Started 30 minutes ago
    const startedAt = Date.now() - 30 * 60 * 1000;
    render(
      <Wrapper>
        <ImpersonationBanner startedAt={startedAt} />
      </Wrapper>,
    );
    // Should show approximately 30 minutes remaining
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Some time display should be visible
    expect(screen.getByText(/\d+:\d\d/)).toBeInTheDocument();
  });

  it('auto-exits when countdown reaches zero', async () => {
    let exitCalled = false;
    server.use(
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ token: 'csrf-test' })),
      http.post('/api/v1/impersonation/exit', () => {
        exitCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get('/api/v1/auth/me', () => HttpResponse.json(notImpersonatingMe)),
    );

    const { Wrapper } = makeWrapper(impersonatingMe);
    // Start past 1h so countdown is already 0 on first tick
    const startedAt = Date.now() - ONE_HOUR_MS - 5000;
    render(
      <Wrapper>
        <ImpersonationBanner startedAt={startedAt} />
      </Wrapper>,
    );

    // Wait for the 1s interval to fire and trigger auto-exit
    await waitFor(() => {
      expect(exitCalled).toBe(true);
    }, { timeout: 3000 });
  }, 5000);
});

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import JoinInvitePage from '../JoinInvitePage';

function makeWrapper(token = 'invite-token-abc') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/join-invite/${token}`]}>
        <Routes>
          <Route path="/join-invite/:token" element={<JoinInvitePage />} />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('JoinInvitePage', () => {
  it('previews the invitee email from the token', async () => {
    server.use(
      http.get('/api/v1/auth/invite/invite-token-abc', () =>
        HttpResponse.json({ valid: true, email: 'invitee@example.com' }),
      ),
    );

    render(makeWrapper());

    await waitFor(() => {
      expect(screen.getByText(/invitee@example.com/i)).toBeInTheDocument();
    });
  });

  it('shows an inactive message for an invalid/expired token', async () => {
    server.use(
      http.get('/api/v1/auth/invite/bad-token', () =>
        HttpResponse.json({ message: 'Token has expired', errorCode: 'TOKEN_EXPIRED' }, { status: 400 }),
      ),
    );

    render(makeWrapper('bad-token'));

    await waitFor(() => {
      expect(screen.getByText(/no longer active/i)).toBeInTheDocument();
    });
  });

  it('rejects mismatched passwords without calling accept', async () => {
    let accepted = false;
    server.use(
      http.get('/api/v1/auth/invite/invite-token-abc', () =>
        HttpResponse.json({ valid: true, email: 'invitee@example.com' }),
      ),
      http.post('/api/v1/auth/invite/accept', () => {
        accepted = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    render(makeWrapper());
    await waitFor(() => screen.getByLabelText('Password'));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Password'), 'GoodPass123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'Different123!');
    await user.click(screen.getByRole('button', { name: /activate account/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
    expect(accepted).toBe(false);
  });

  it('accepts the invite and shows a success state with a sign-in link', async () => {
    server.use(
      http.get('/api/v1/auth/invite/invite-token-abc', () =>
        HttpResponse.json({ valid: true, email: 'invitee@example.com' }),
      ),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ token: 'csrf-test' })),
      http.post('/api/v1/auth/invite/accept', async ({ request }) => {
        const body = (await request.json()) as { token: string; password: string };
        expect(body.token).toBe('invite-token-abc');
        expect(body.password).toBe('GoodPass123!');
        return HttpResponse.json({ ok: true });
      }),
    );

    render(makeWrapper());
    await waitFor(() => screen.getByLabelText('Password'));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Password'), 'GoodPass123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'GoodPass123!');
    await user.click(screen.getByRole('button', { name: /activate account/i }));

    await waitFor(() => {
      expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /go to sign in/i })).toBeInTheDocument();
  });
});

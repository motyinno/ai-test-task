import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import JoinPage from '../JoinPage';

function makeWrapper(code = 'valid-code-abc') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/join/${code}`]}>
        <Routes>
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('JoinPage', () => {
  it('shows trainer branding from link validation on mount', async () => {
    server.use(
      http.get('/api/v1/sharelinks/valid-code-abc/validate', () =>
        HttpResponse.json({
          valid: true,
          type: 'STATIC',
          trainerName: 'Coach Bob',
        }),
      ),
    );

    render(makeWrapper('valid-code-abc'));

    await waitFor(() => {
      expect(screen.getByText(/JOIN COACH BOB/i)).toBeInTheDocument();
    });
  });

  it('shows friendly error for invalid/expired link (410)', async () => {
    server.use(
      http.get('/api/v1/sharelinks/expired-code/validate', () =>
        HttpResponse.json(
          { valid: false, reason: 'expired', trainerName: 'Coach Bob' },
          { status: 410 },
        ),
      ),
    );

    render(makeWrapper('expired-code'));

    await waitFor(() => {
      expect(screen.getByText(/no longer active/i)).toBeInTheDocument();
    });
  });

  it('shows registration form for valid link', async () => {
    server.use(
      http.get('/api/v1/sharelinks/valid-code-abc/validate', () =>
        HttpResponse.json({
          valid: true,
          type: 'STATIC',
          trainerName: 'Coach Bob',
        }),
      ),
    );

    render(makeWrapper('valid-code-abc'));

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });
  });

  it('shows "ask a parent" screen for CHILD_SHARELINK_BLOCKED (403)', async () => {
    server.use(
      http.get('/api/v1/sharelinks/valid-code-abc/validate', () =>
        HttpResponse.json({
          valid: true,
          type: 'STATIC',
          trainerName: 'Coach Bob',
        }),
      ),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ token: 'csrf-test' })),
      http.post('/api/v1/join/valid-code-abc', () =>
        HttpResponse.json(
          { statusCode: 403, message: 'Child cannot use sharelinks', errorCode: 'CHILD_SHARELINK_BLOCKED' },
          { status: 403 },
        ),
      ),
    );

    render(makeWrapper('valid-code-abc'));

    await waitFor(() => screen.getByLabelText(/name/i));

    await userEvent.type(screen.getByLabelText(/name/i), 'Alice');
    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'securepass123');
    await userEvent.click(screen.getByRole('button', { name: /join|register/i }));

    await waitFor(() => {
      expect(screen.getByText(/ask a parent/i)).toBeInTheDocument();
    });
  });
});

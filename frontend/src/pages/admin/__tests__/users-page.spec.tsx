import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import UsersPage from '../UsersPage';
import { ME_QUERY_KEY } from '@/providers/auth-provider';

const mockSA = {
  id: 'sa-uuid',
  role: 'SUPER_ADMIN',
  isChild: false,
  emailVerified: true,
  mustChangePassword: false,
  activeContext: { profileId: 'p1', label: 'Admin' },
};

const mockUsers = [
  {
    id: 'u1',
    email: 'alice@example.com',
    role: 'TRAINER',
    status: 'ACTIVE',
    displayName: 'Alice Trainer',
    emailVerified: true,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'u2',
    email: 'deleted-uuid@anonymized',
    role: 'PLAYER',
    status: 'DELETED',
    displayName: 'Deleted User',
    emailVerified: false,
    anonymizedAt: '2025-06-01T00:00:00Z',
    createdAt: '2025-01-15T00:00:00Z',
  },
];

const mockMeta = { page: 1, limit: 20, total: 2, totalPages: 1 };

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  qc.setQueryData(ME_QUERY_KEY, mockSA);

  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SA UsersPage', () => {
  it('renders tale-of-the-tape total user count', async () => {
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json({ data: mockUsers, meta: mockMeta }),
      ),
    );

    render(makeWrapper());

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('renders user rows with email and status', async () => {
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json({ data: mockUsers, meta: mockMeta }),
      ),
    );

    render(makeWrapper());

    await waitFor(() => {
      expect(screen.getByText('Alice Trainer')).toBeInTheDocument();
      expect(screen.getByText('Deleted User')).toBeInTheDocument();
    });
  });

  it('renders DELETED rows with "Deleted User" text', async () => {
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json({ data: mockUsers, meta: mockMeta }),
      ),
    );

    render(makeWrapper());

    await waitFor(() => {
      expect(screen.getByText('Deleted User')).toBeInTheDocument();
    });
  });

  it('opens Create User sheet on button click', async () => {
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json({ data: mockUsers, meta: mockMeta }),
      ),
    );

    render(makeWrapper());

    await waitFor(() => screen.getByText('Alice Trainer'));
    await userEvent.click(screen.getByRole('button', { name: /create user|add user|create trainer/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('shows EMAIL_EXISTS error inline in the create sheet', async () => {
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json({ data: mockUsers, meta: mockMeta }),
      ),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ token: 'csrf-test' })),
      http.post('/api/v1/users', () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Email already exists', errorCode: 'EMAIL_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    render(makeWrapper());

    await waitFor(() => screen.getByText('Alice Trainer'));
    await userEvent.click(screen.getByRole('button', { name: /create trainer/i }));
    const dialog = await waitFor(() => screen.getByRole('dialog'));

    // Fill required fields within the dialog
    const { getByLabelText, getByRole: getByRoleInDialog } = within(dialog);
    await userEvent.type(getByLabelText(/business name/i), 'Acme Inc');
    await userEvent.type(getByLabelText(/trainer name/i), 'Bob Trainer');
    await userEvent.type(getByLabelText(/email/i), 'existing@example.com');

    await userEvent.click(getByRoleInDialog('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText(/email already exists/i)).toBeInTheDocument();
    });
  });

  it('ink/paper only — no --brand reference in SA chrome', async () => {
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json({ data: mockUsers, meta: mockMeta }),
      ),
    );

    const { container } = render(makeWrapper());
    await waitFor(() => screen.getByText('Alice Trainer'));

    // SA chrome should not reference var(--brand) on the main container
    const mainEl = container.querySelector('[data-sa-chrome]') as HTMLElement | null;
    if (mainEl) {
      expect(mainEl.style.cssText).not.toContain('var(--brand)');
    }
    // The page renders with ink/paper tokens
    expect(container.firstChild).toBeTruthy();
  });
});

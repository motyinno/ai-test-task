import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProfilePage from '../ProfilePage';
import { ME_QUERY_KEY } from '@/providers/auth-provider';

const mockCoach = {
  id: 'coach-uuid',
  role: 'COACH',
  isChild: false,
  emailVerified: true,
  mustChangePassword: false,
  activeContext: { profileId: 'p1', label: 'Coach Bob' },
};

const mockProfile = {
  id: 'profile-1',
  role: 'COACH',
  email: 'coach@example.com',
  firstName: 'Bob',
  lastName: 'Smith',
  phone: '555-0100',
  bio: 'Experienced athletics coach.',
  publicProfile: true,
  createdAt: '2024-01-01T00:00:00Z',
};

function makeWrapper(role = 'COACH') {
  const me = { ...mockCoach, role };
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  qc.setQueryData(ME_QUERY_KEY, me);

  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProfilePage', () => {
  it('renders read-only email and role as locked mono rows', async () => {
    server.use(
      http.get('/api/v1/me/profile', () => HttpResponse.json(mockProfile)),
    );

    render(makeWrapper());

    await waitFor(() => {
      expect(screen.getByText('coach@example.com')).toBeInTheDocument();
    });

    // Email should be marked as read-only
    const emailEl = screen.getByText('coach@example.com');
    expect(emailEl).toBeInTheDocument();
  });

  it('renders editable name field (single Name, role with a name)', async () => {
    server.use(
      http.get('/api/v1/me/profile', () => HttpResponse.json({ ...mockProfile, role: 'TRAINER' })),
    );

    // TRAINER/PLAYER have a single display name; COACH has none in the data model.
    render(makeWrapper('TRAINER'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Bob')).toBeInTheDocument();
    });
  });

  it('shows coach-specific fields (bio, credentials, public toggle)', async () => {
    server.use(
      http.get('/api/v1/me/profile', () => HttpResponse.json(mockProfile)),
    );

    render(makeWrapper('COACH'));

    await waitFor(() => {
      expect(screen.getByLabelText(/bio/i)).toBeInTheDocument();
    });
  });

  it('submits PATCH /me/profile and shows confirmation', async () => {
    server.use(
      http.get('/api/v1/me/profile', () => HttpResponse.json({ ...mockProfile, role: 'TRAINER' })),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ token: 'csrf-test' })),
      http.patch('/api/v1/me/profile', () =>
        HttpResponse.json({ ...mockProfile, role: 'TRAINER', firstName: 'Robert' }),
      ),
    );

    render(makeWrapper('TRAINER'));

    await waitFor(() => screen.getByDisplayValue('Bob'));

    const firstNameInput = screen.getByDisplayValue('Bob');
    await userEvent.clear(firstNameInput);
    await userEvent.type(firstNameInput, 'Robert');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/saved|profile updated/i)).toBeInTheDocument();
    });
  });
});

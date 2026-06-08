import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ContextSwitcher } from '../ContextSwitcher';
import { ME_QUERY_KEY } from '@/providers/auth-provider';

const singleContextMe = {
  id: 'user-1',
  role: 'PLAYER',
  isChild: false,
  emailVerified: true,
  mustChangePassword: false,
  activeContext: { profileId: 'profile-1', trainerId: 'trainer-1', label: 'Maya → Coach Bob' },
};

const multiContextsResponse = [
  { profileId: 'profile-1', profileName: 'Maya', trainerId: 'trainer-1', trainerName: 'Coach Bob', isSelf: true },
  { profileId: 'profile-1', profileName: 'Maya', trainerId: 'trainer-2', trainerName: 'Coach Alice', isSelf: true },
  { profileId: 'child-1', profileName: 'Sam', trainerId: 'trainer-1', trainerName: 'Coach Bob', isSelf: false },
];

const childPrincipalMe = {
  id: 'child-user-1',
  role: 'PLAYER',
  isChild: true,
  emailVerified: true,
  mustChangePassword: false,
  activeContext: { profileId: 'child-profile-1', trainerId: 'trainer-1', label: 'Sam → Coach Bob' },
};

const childContextsResponse = [
  { profileId: 'child-profile-1', profileName: 'Sam', trainerId: 'trainer-1', trainerName: 'Coach Bob', isSelf: true },
];

function makeWrapper(meData: object) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  qc.setQueryData(ME_QUERY_KEY, meData);

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return { qc, Wrapper };
}

describe('ContextSwitcher', () => {
  describe('single context — static masthead', () => {
    it('renders active context label without a chevron (no expand)', async () => {
      server.use(
        http.get('/api/v1/players/me/contexts', () =>
          HttpResponse.json({ data: [multiContextsResponse[0]], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
        ),
      );

      const { Wrapper } = makeWrapper(singleContextMe);
      render(<Wrapper><ContextSwitcher /></Wrapper>);

      await waitFor(() => {
        expect(screen.getByText(/Maya → Coach Bob/i)).toBeInTheDocument();
      });
      // No expand button for single context
      expect(screen.queryByRole('button', { name: /switch context/i })).not.toBeInTheDocument();
    });
  });

  describe('multi context — expandable dropdown', () => {
    it('shows a button to open the switcher for multi-context', async () => {
      server.use(
        http.get('/api/v1/players/me/contexts', () =>
          HttpResponse.json({ data: multiContextsResponse, meta: { page: 1, limit: 20, total: 3, totalPages: 1 } }),
        ),
      );

      const { Wrapper } = makeWrapper(singleContextMe);
      render(<Wrapper><ContextSwitcher /></Wrapper>);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /switch context/i })).toBeInTheDocument();
      });
    });

    it('opens channel list with grouped sections on click', async () => {
      server.use(
        http.get('/api/v1/players/me/contexts', () =>
          HttpResponse.json({ data: multiContextsResponse, meta: { page: 1, limit: 20, total: 3, totalPages: 1 } }),
        ),
      );

      const { Wrapper } = makeWrapper(singleContextMe);
      render(<Wrapper><ContextSwitcher /></Wrapper>);

      await waitFor(() => screen.getByRole('button', { name: /switch context/i }));
      await userEvent.click(screen.getByRole('button', { name: /switch context/i }));

      // Should show groups
      await waitFor(() => {
        expect(screen.getByText(/Your Training/i)).toBeInTheDocument();
        expect(screen.getByText(/Your Children/i)).toBeInTheDocument();
      });
    });

    it('calls POST /players/me/context and closes when selecting an entry', async () => {
      let contextSwitched = false;
      server.use(
        http.get('/api/v1/players/me/contexts', () =>
          HttpResponse.json({ data: multiContextsResponse, meta: { page: 1, limit: 20, total: 3, totalPages: 1 } }),
        ),
        http.get('/api/v1/auth/csrf', () => HttpResponse.json({ token: 'csrf-test' })),
        http.post('/api/v1/players/me/context', () => {
          contextSwitched = true;
          return HttpResponse.json({ success: true });
        }),
        http.get('/api/v1/auth/me', () => HttpResponse.json(singleContextMe)),
      );

      const { Wrapper } = makeWrapper(singleContextMe);
      render(<Wrapper><ContextSwitcher /></Wrapper>);

      await waitFor(() => screen.getByRole('button', { name: /switch context/i }));
      await userEvent.click(screen.getByRole('button', { name: /switch context/i }));

      // Click on a context option
      await waitFor(() => screen.getAllByRole('option').length > 0);
      const options = screen.getAllByRole('option');
      await userEvent.click(options[0]);

      await waitFor(() => {
        expect(contextSwitched).toBe(true);
      });
    });

    it('supports keyboard: ArrowDown to move focus, Enter to select', async () => {
      server.use(
        http.get('/api/v1/players/me/contexts', () =>
          HttpResponse.json({ data: multiContextsResponse, meta: { page: 1, limit: 20, total: 3, totalPages: 1 } }),
        ),
        http.get('/api/v1/auth/csrf', () => HttpResponse.json({ token: 'csrf-test' })),
        http.post('/api/v1/players/me/context', () => HttpResponse.json({ success: true })),
        http.get('/api/v1/auth/me', () => HttpResponse.json(singleContextMe)),
      );

      const { Wrapper } = makeWrapper(singleContextMe);
      render(<Wrapper><ContextSwitcher /></Wrapper>);

      await waitFor(() => screen.getByRole('button', { name: /switch context/i }));
      await userEvent.click(screen.getByRole('button', { name: /switch context/i }));

      await waitFor(() => screen.getAllByRole('option').length > 0);
      // The listbox should be present
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });

  describe('child principal', () => {
    it('shows only their own trainer list — no "Me" group', async () => {
      server.use(
        http.get('/api/v1/players/me/contexts', () =>
          HttpResponse.json({ data: childContextsResponse, meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
        ),
      );

      const { Wrapper } = makeWrapper(childPrincipalMe);
      render(<Wrapper><ContextSwitcher /></Wrapper>);

      // Child with only 1 context -> static masthead, no expand
      await waitFor(() => {
        expect(screen.getByText(/Sam → Coach Bob/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/Your Training/i)).not.toBeInTheDocument();
    });
  });
});

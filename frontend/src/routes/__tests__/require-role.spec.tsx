import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/providers/auth-provider';
import { RequireRole } from '../RequireRole';

function makeWrapper(initialPath: string, children: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          {children}
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const mockSuperAdmin = {
  id: 'sa-uuid',
  role: 'SUPER_ADMIN',
  isChild: false,
  emailVerified: true,
  mustChangePassword: false,
  activeContext: { profileId: 'p1', label: 'Admin' },
};

const mockPlayer = {
  id: 'player-uuid',
  role: 'PLAYER',
  isChild: false,
  emailVerified: true,
  mustChangePassword: false,
  activeContext: { profileId: 'p2', label: 'Maya → Coach Bob' },
};

describe('RequireRole', () => {
  it('redirects unauthenticated user to /login when visiting a protected route', async () => {
    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({ statusCode: 401 }, { status: 401 }),
      ),
    );

    render(
      makeWrapper(
        '/admin/users',
        <Routes>
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route
            path="/admin/users"
            element={
              <RequireRole roles={['SUPER_ADMIN']}>
                <div data-testid="users-page">Users</div>
              </RequireRole>
            }
          />
        </Routes>,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('users-page')).not.toBeInTheDocument();
  });

  it('shows forbidden for PLAYER visiting SA-only route', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(mockPlayer)),
    );

    render(
      makeWrapper(
        '/admin/users',
        <Routes>
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/forbidden" element={<div data-testid="forbidden-page">Forbidden</div>} />
          <Route
            path="/admin/users"
            element={
              <RequireRole roles={['SUPER_ADMIN']}>
                <div data-testid="users-page">Users</div>
              </RequireRole>
            }
          />
        </Routes>,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('forbidden-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('users-page')).not.toBeInTheDocument();
  });

  it('allows SUPER_ADMIN to reach /admin/users', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(mockSuperAdmin)),
    );

    render(
      makeWrapper(
        '/admin/users',
        <Routes>
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route
            path="/admin/users"
            element={
              <RequireRole roles={['SUPER_ADMIN']}>
                <div data-testid="users-page">Users</div>
              </RequireRole>
            }
          />
        </Routes>,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('users-page')).toBeInTheDocument();
    });
  });

  it('redirects to /change-password when mustChangePassword is true', async () => {
    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({ ...mockPlayer, mustChangePassword: true }),
      ),
    );

    render(
      makeWrapper(
        '/dashboard',
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/change-password" element={<div data-testid="change-pw-page">Change PW</div>} />
          <Route
            path="/dashboard"
            element={
              <RequireRole roles={['PLAYER']}>
                <div data-testid="dashboard">Dashboard</div>
              </RequireRole>
            }
          />
        </Routes>,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('change-pw-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });
});

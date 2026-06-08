import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useMe, useLogin, useLogout } from '../auth-provider';

// Test helpers
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return { queryClient, Wrapper };
}

const mockMeResponse = {
  id: 'user-uuid-1',
  role: 'PLAYER',
  isChild: false,
  emailVerified: true,
  mustChangePassword: false,
  impersonatedBy: undefined,
  activeContext: {
    profileId: 'profile-uuid-1',
    trainerId: 'trainer-uuid-1',
    label: 'Maya → Coach Bob',
  },
};

describe('AuthProvider + useMe', () => {
  it('exposes principal when GET /auth/me returns 200', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(mockMeResponse)),
    );

    const { Wrapper } = makeWrapper();

    function TestComp() {
      const me = useMe();
      if (me.isLoading) return <div>loading</div>;
      if (!me.data) return <div>no user</div>;
      return <div data-testid="role">{me.data.role}</div>;
    }

    render(<Wrapper><TestComp /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('PLAYER');
    });
  });

  it('resolves to unauthenticated (null) when /auth/me returns 401', async () => {
    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json(
          { statusCode: 401, message: 'Unauthorized', errorCode: 'UNAUTHENTICATED' },
          { status: 401 },
        ),
      ),
    );

    const { Wrapper } = makeWrapper();

    function TestComp() {
      const me = useMe();
      if (me.isLoading) return <div>loading</div>;
      return <div data-testid="status">{me.data ? 'authenticated' : 'unauthenticated'}</div>;
    }

    render(<Wrapper><TestComp /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    });
  });

  it('exposes role, activeContext, isChild from MeResponseDto', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(mockMeResponse)),
    );

    const { Wrapper } = makeWrapper();

    function TestComp() {
      const me = useMe();
      if (!me.data) return <div>no data</div>;
      return (
        <div>
          <span data-testid="isChild">{String(me.data.isChild)}</span>
          <span data-testid="label">{me.data.activeContext.label}</span>
        </div>
      );
    }

    render(<Wrapper><TestComp /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByTestId('isChild')).toHaveTextContent('false');
      expect(screen.getByTestId('label')).toHaveTextContent('Maya → Coach Bob');
    });
  });
});

describe('useLogin', () => {
  it('posts credentials and populates principal on success', async () => {
    server.use(
      http.post('/api/v1/auth/login', () => HttpResponse.json(mockMeResponse)),
      http.get('/api/v1/auth/me', () => HttpResponse.json(mockMeResponse)),
    );

    const { Wrapper } = makeWrapper();

    let loginFn: ((creds: { email: string; password: string }) => Promise<void>) | null = null;

    function TestComp() {
      const me = useMe();
      const login = useLogin();

      loginFn = async (creds) => {
        await act(async () => {
          login.mutate(creds);
        });
      };

      if (me.isLoading) return <div>loading</div>;
      return <div data-testid="role">{me.data?.role ?? 'none'}</div>;
    }

    render(<Wrapper><TestComp /></Wrapper>);

    await waitFor(() => screen.getByTestId('role'));

    await act(async () => {
      await loginFn!({ email: 'a@b.com', password: 'password123' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('PLAYER');
    });
  });
});

describe('useLogout', () => {
  it('clears session after logout', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(mockMeResponse)),
      http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );

    const { Wrapper } = makeWrapper();

    function TestComp() {
      const me = useMe();
      const logout = useLogout();
      return (
        <div>
          <span data-testid="status">{me.data ? 'logged-in' : 'logged-out'}</span>
          <button onClick={() => logout.mutate()}>Logout</button>
        </div>
      );
    }

    render(<Wrapper><TestComp /></Wrapper>);

    // After logout, re-fetch me should return null/unauthenticated
    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({ statusCode: 401 }, { status: 401 }),
      ),
    );
  });
});

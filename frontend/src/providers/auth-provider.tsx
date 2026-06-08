import React, { createContext, useContext } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { authApi, type MeResponseDto, type LoginDto } from '@/api/endpoints/auth';
import { ApiError } from '@/api/errors';
import { clearCsrfCache } from '@/api/client';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

interface AuthContextValue {
  /** Access raw query state if needed */
  meQuery: UseQueryResult<MeResponseDto | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 401) {
          return null; // unauthenticated — not a crash
        }
        throw err;
      }
    },
    staleTime: 60_000,
  });

  return (
    <AuthContext.Provider value={{ meQuery }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Returns query for the current principal (null = unauthenticated). */
export function useMe() {
  const ctx = useContext(AuthContext);
  if (ctx) return ctx.meQuery;
  // Fallback: allow useMe outside AuthProvider (e.g. tests that mount directly)
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 401) return null;
        throw err;
      }
    },
  });
}

/** Login mutation — invalidates "me" on success. */
export function useLogin(): UseMutationResult<MeResponseDto, Error, LoginDto> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: LoginDto) => authApi.login(dto),
    onSuccess: (data) => {
      qc.setQueryData(ME_QUERY_KEY, data);
    },
  });
}

/** Logout mutation — clears query cache + CSRF cache. */
export function useLogout(): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      clearCsrfCache();
      qc.setQueryData(ME_QUERY_KEY, null);
      qc.clear();
    },
  });
}

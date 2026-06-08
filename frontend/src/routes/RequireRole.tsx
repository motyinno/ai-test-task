import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '@/providers/auth-provider';
import type { MeResponseDto } from '@/api/endpoints/auth';

type UserRole = MeResponseDto['role'];

interface RequireRoleProps {
  roles: UserRole[];
  children: React.ReactNode;
}

/**
 * Role-based route guard.
 * - Loading: renders null (spinner could be added here).
 * - Unauthenticated: redirects to /login.
 * - mustChangePassword: redirects to /change-password (FR-006).
 * - Wrong role: redirects to /forbidden.
 * - Authorized: renders children.
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const location = useLocation();
  const { data: me, isLoading } = useMe();

  if (isLoading) {
    return null; // or a skeleton
  }

  if (!me) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (me.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  if (!roles.includes(me.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}

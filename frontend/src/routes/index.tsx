import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireRole } from './RequireRole';

// Lazy-loaded pages
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const JoinPage = lazy(() => import('@/pages/JoinPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const ChangePasswordPage = lazy(() => import('@/pages/ChangePasswordPage'));
const ForbiddenPage = lazy(() => import('@/pages/ForbiddenPage'));

function PageFallback() {
  return <div role="status" aria-label="Loading page">Loading…</div>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />

        {/* Authenticated shell */}
        <Route element={<AppShell />}>
          {/* Any authenticated user */}
          <Route
            path="/profile"
            element={
              <RequireRole roles={['SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER']}>
                <ProfilePage />
              </RequireRole>
            }
          />

          {/* Super Admin only */}
          <Route
            path="/admin/users"
            element={
              <RequireRole roles={['SUPER_ADMIN']}>
                <UsersPage />
              </RequireRole>
            }
          />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

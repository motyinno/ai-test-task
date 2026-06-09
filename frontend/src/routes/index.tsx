import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireRole } from './RequireRole';

// Lazy-loaded pages — existing
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const JoinPage = lazy(() => import('@/pages/JoinPage'));
const JoinInvitePage = lazy(() => import('@/pages/JoinInvitePage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const ChangePasswordPage = lazy(() => import('@/pages/ChangePasswordPage'));
const ForbiddenPage = lazy(() => import('@/pages/ForbiddenPage'));

// Lazy-loaded pages — F-Index screens
const FamilyDashboard = lazy(() => import('@/pages/FamilyDashboard'));
const BestTimesGrid = lazy(() => import('@/pages/BestTimesGrid'));
const MyTimesGrid = lazy(() => import('@/pages/MyTimesGrid'));
const ApprovalsQueue = lazy(() => import('@/pages/ApprovalsQueue'));
const TrainerBranding = lazy(() => import('@/pages/TrainerBranding'));

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
        <Route path="/join-invite/:token" element={<JoinInvitePage />} />
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

          {/* FI-1: Family Dashboard — PLAYER (parent) */}
          <Route
            path="/family"
            element={
              <RequireRole roles={['PLAYER']}>
                <FamilyDashboard />
              </RequireRole>
            }
          />

          {/* FI-2: Best Times Grid — PLAYER (parent, per-profile) */}
          <Route
            path="/availability/player"
            element={
              <RequireRole roles={['PLAYER']}>
                <BestTimesGrid />
              </RequireRole>
            }
          />

          {/* FI-3: My Times Grid — COACH */}
          <Route
            path="/availability/coach"
            element={
              <RequireRole roles={['COACH']}>
                <MyTimesGrid />
              </RequireRole>
            }
          />

          {/* FI-4: Approvals Queue — PLAYER (parent) */}
          <Route
            path="/approvals"
            element={
              <RequireRole roles={['PLAYER']}>
                <ApprovalsQueue />
              </RequireRole>
            }
          />

          {/* FI-5: Trainer Branding — TRAINER */}
          <Route
            path="/branding"
            element={
              <RequireRole roles={['TRAINER']}>
                <TrainerBranding />
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

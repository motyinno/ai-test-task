/**
 * A11y smoke tests — axe via vitest-axe on Login + UsersTable.
 * These catch structural accessibility violations (NFR-006 WCAG 2.1 AA).
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import UsersPage from '@/pages/admin/UsersPage';
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
];

const mockMeta = { page: 1, limit: 20, total: 1, totalPages: 1 };

/**
 * Helper: run axe and assert no serious/critical violations.
 * We check for serious/critical only (WCAG 2.1 AA level).
 */
async function expectNoA11yViolations(container: Element) {
  const results = await axe(container, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
  });

  // Filter to serious/critical violations only
  const criticalViolations = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );

  if (criticalViolations.length > 0) {
    const messages = criticalViolations.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.description}\n  Nodes: ${v.nodes.map((n) => n.html).join(', ')}`,
    );
    throw new Error(
      `${criticalViolations.length} serious/critical a11y violations:\n\n${messages.join('\n\n')}`,
    );
  }
}

describe('A11y smoke tests (WCAG 2.1 AA)', () => {
  it('LoginPage has no serious/critical axe violations', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await expectNoA11yViolations(container);
  });

  it('UsersPage (SA) has no serious/critical axe violations', async () => {
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json({ data: mockUsers, meta: mockMeta }),
      ),
    );

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(ME_QUERY_KEY, mockSA);

    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Wait for data to load
    await waitFor(() => {
      // Page should have some content
      expect(container.querySelector('main')).toBeTruthy();
    });
    // Additional wait for async rendering
    await new Promise((r) => setTimeout(r, 300));

    await expectNoA11yViolations(container);
  });
});

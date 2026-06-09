/**
 * FI-4 ApprovalsQueue tests — RTL + MSW
 * Covers: loading, empty, pending cards, approve/deny, FYI section, token toggle, axe a11y
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ApprovalsQueue from '@/pages/ApprovalsQueue';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ApprovalsQueue />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const pendingUSD = {
  id: 'approval-1',
  childProfileId: 'child-1',
  childName: 'Maya',
  eventRef: 'Soccer Camp 2025',
  amount: 49.99,
  paymentType: 'USD' as const,
  status: 'PENDING' as const,
  autoApproved: false,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
};

const pendingToken = {
  id: 'approval-2',
  childProfileId: 'child-2',
  childName: 'Alex',
  eventRef: 'Swimming Lesson',
  amount: 3,
  paymentType: 'TOKEN' as const,
  status: 'PENDING' as const,
  autoApproved: false,
  expiresAt: new Date(Date.now() + 40 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
};

const autoApprovedToken = {
  id: 'approval-3',
  childProfileId: 'child-1',
  childName: 'Maya',
  eventRef: 'Training Session',
  amount: 2,
  paymentType: 'TOKEN' as const,
  status: 'APPROVED' as const,
  autoApproved: true,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

const emptyResponse = { data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0 } };

describe('ApprovalsQueue', () => {
  it('shows loading state', () => {
    server.use(
      http.get('/api/v1/approvals', async () => {
        await new Promise(() => {});
        return HttpResponse.json(emptyResponse);
      }),
    );
    renderPage();
    expect(screen.getByRole('status', { name: /loading approvals/i })).toBeInTheDocument();
  });

  it('shows empty state when no pending approvals', async () => {
    server.use(
      http.get('/api/v1/approvals', () => HttpResponse.json(emptyResponse)),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('empty-pending')).toBeInTheDocument();
    });
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it('renders pending approval cards with payment type chips', async () => {
    server.use(
      http.get('/api/v1/approvals', () =>
        HttpResponse.json({
          data: [pendingUSD, pendingToken],
          meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
        }),
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('article', { name: /approval request for maya/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('article', { name: /approval request for alex/i })).toBeInTheDocument();
    // USD chip
    expect(screen.getByLabelText(/payment type: USD/i)).toBeInTheDocument();
    // TOKEN chip
    expect(screen.getByLabelText(/payment type: TOKEN/i)).toBeInTheDocument();
    // Amount
    expect(screen.getByText('$49.99')).toBeInTheDocument();
    expect(screen.getByText('3 tokens')).toBeInTheDocument();
  });

  it('renders countdown ring with hours remaining', async () => {
    server.use(
      http.get('/api/v1/approvals', () =>
        HttpResponse.json({
          data: [pendingUSD],
          meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      ),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('article', { name: /approval request for maya/i })).toBeInTheDocument(),
    );
    // Countdown ring shows remaining hours
    const rings = screen.getAllByRole('img');
    expect(rings.length).toBeGreaterThan(0);
    // Check aria-label contains "hours remaining"
    const ring = rings.find((el) => el.getAttribute('aria-label')?.includes('hours remaining'));
    expect(ring).toBeDefined();
  });

  it('calls approve endpoint and refreshes', async () => {
    let approveCalled = false;
    server.use(
      http.get('/api/v1/approvals', () =>
        HttpResponse.json({
          data: [pendingUSD],
          meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      ),
      http.post('/api/v1/approvals/approval-1/approve', () => {
        approveCalled = true;
        return HttpResponse.json({ ...pendingUSD, status: 'APPROVED', resolvedAt: new Date().toISOString() });
      }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('article', { name: /approval request for maya/i })).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /approve request for maya/i }));
    await waitFor(() => expect(approveCalled).toBe(true));
  });

  it('calls deny endpoint', async () => {
    let denyCalled = false;
    server.use(
      http.get('/api/v1/approvals', () =>
        HttpResponse.json({
          data: [pendingUSD],
          meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      ),
      http.post('/api/v1/approvals/approval-1/deny', () => {
        denyCalled = true;
        return HttpResponse.json({ ...pendingUSD, status: 'DENIED', resolvedAt: new Date().toISOString() });
      }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('article', { name: /approval request for maya/i })).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /deny request for maya/i }));
    await waitFor(() => expect(denyCalled).toBe(true));
  });

  it('shows auto-approved FYI section', async () => {
    server.use(
      http.get('/api/v1/approvals', () =>
        HttpResponse.json({
          data: [autoApprovedToken],
          meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/FYI — Auto-Approved/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('article', { name: /auto-approved spend for Maya/i })).toBeInTheDocument();
    // AUTO badge
    expect(screen.getAllByText(/auto/i).length).toBeGreaterThan(0);
  });

  it('calls token setting PATCH when toggle is clicked', async () => {
    let patchCalled = false;
    let patchBody: unknown = null;
    server.use(
      http.get('/api/v1/approvals', () =>
        HttpResponse.json({
          data: [pendingToken],
          meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      ),
      http.patch('/api/v1/players/me/children/child-2/token-setting', async ({ request }) => {
        patchBody = await request.json();
        patchCalled = true;
        return HttpResponse.json({});
      }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('article', { name: /approval request for alex/i })).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    // Toggle uses role="switch" (see FormControls.tsx)
    const toggle = screen.getByRole('switch', { name: /auto-approve tokens/i });
    await user.click(toggle);

    await waitFor(() => {
      expect(patchCalled).toBe(true);
      expect((patchBody as { allowTokenSpendWithoutApproval: boolean }).allowTokenSpendWithoutApproval).toBe(true);
    });
  });

  it('shows error when API fails', async () => {
    server.use(
      http.get('/api/v1/approvals', () =>
        HttpResponse.json({ statusCode: 500, message: 'Server error' }, { status: 500 }),
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('axe a11y smoke — no serious/critical violations', async () => {
    server.use(
      http.get('/api/v1/approvals', () =>
        HttpResponse.json({
          data: [pendingUSD, autoApprovedToken],
          meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
        }),
      ),
    );
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getByRole('article', { name: /approval request for maya/i })).toBeInTheDocument(),
    );

    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical).toHaveLength(0);
  });
});

/**
 * NotificationsBell tests — RTL + MSW
 * Covers: empty/data states, unread badge, mark-as-read, axe a11y
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsBell } from '@/features/notifications/NotificationsBell';

function renderBell() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationsBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const unreadNotification = {
  id: 'notif-1',
  userId: 'user-1',
  type: 'AVAILABILITY_OVERRIDE' as const,
  title: 'Availability Override',
  body: 'A scheduling conflict was auto-resolved.',
  read: false,
  createdAt: '2026-06-09T10:00:00Z',
};

const readNotification = {
  id: 'notif-2',
  userId: 'user-1',
  type: 'GENERAL' as const,
  title: 'Welcome',
  body: 'Welcome to PracticePerfect.',
  read: true,
  createdAt: '2026-06-08T10:00:00Z',
};

describe('NotificationsBell', () => {
  it('renders bell button', async () => {
    server.use(
      http.get('/api/v1/notifications', () => HttpResponse.json({ data: [] })),
    );
    renderBell();
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('shows unread badge when there are unread notifications', async () => {
    server.use(
      http.get('/api/v1/notifications', () =>
        HttpResponse.json({ data: [unreadNotification] }),
      ),
    );
    renderBell();
    await waitFor(() => {
      // aria-label should mention unread count
      expect(screen.getByRole('button', { name: /1 unread/i })).toBeInTheDocument();
    });
  });

  it('opens notification panel on click', async () => {
    server.use(
      http.get('/api/v1/notifications', () =>
        HttpResponse.json({ data: [unreadNotification] }),
      ),
    );
    renderBell();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /notifications/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /notifications/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Availability Override')).toBeInTheDocument();
    expect(screen.getByText('Override')).toBeInTheDocument();
  });

  it('shows empty state when no notifications', async () => {
    server.use(
      http.get('/api/v1/notifications', () => HttpResponse.json({ data: [] })),
    );
    renderBell();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /notifications/i }));

    await waitFor(() => {
      expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
    });
  });

  it('marks notification as read on click', async () => {
    let markReadCalled = false;
    server.use(
      http.get('/api/v1/notifications', () =>
        HttpResponse.json({ data: [unreadNotification] }),
      ),
      http.post('/api/v1/notifications/notif-1/read', () => {
        markReadCalled = true;
        return HttpResponse.json({ ...unreadNotification, read: true });
      }),
    );
    renderBell();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /1 unread/i })).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /notifications/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark as read/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /mark as read/i }));
    await waitFor(() => expect(markReadCalled).toBe(true));
  });

  it('axe a11y smoke on bell + open panel', async () => {
    server.use(
      http.get('/api/v1/notifications', () =>
        HttpResponse.json({ data: [unreadNotification, readNotification] }),
      ),
    );
    const { container } = renderBell();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument(),
    );

    // Open the panel
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical).toHaveLength(0);
  });
});

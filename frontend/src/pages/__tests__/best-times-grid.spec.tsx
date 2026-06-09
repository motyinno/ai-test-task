/**
 * FI-2 BestTimesGrid tests — RTL + MSW
 * Covers: loading, empty, data states + PUT on save + axe a11y smoke
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import BestTimesGrid from '@/pages/BestTimesGrid';
import { ME_QUERY_KEY } from '@/providers/auth-provider';

const mockMe = {
  id: 'user-1',
  role: 'PLAYER',
  isChild: false,
  emailVerified: true,
  mustChangePassword: false,
  activeContext: { profileId: 'profile-1', trainerId: 'trainer-1', label: 'Maya → Coach Bob' },
};

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  qc.setQueryData(ME_QUERY_KEY, mockMe);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BestTimesGrid />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const emptyAvailability = { slots: [] };
const populatedAvailability = {
  slots: [
    { dayOfWeek: 'MON', startTime: '16:00', endTime: '18:00' },
    { dayOfWeek: 'WED', startTime: '09:00', endTime: '10:00' },
  ],
};

describe('BestTimesGrid', () => {
  it('shows loading state', () => {
    server.use(
      http.get('/api/v1/players/profile-1/availability', async () => {
        await new Promise(() => {});
        return HttpResponse.json(emptyAvailability);
      }),
    );
    renderPage();
    expect(screen.getByRole('status', { name: /loading availability/i })).toBeInTheDocument();
  });

  it('renders availability grid after loading', async () => {
    server.use(
      http.get('/api/v1/players/profile-1/availability', () =>
        HttpResponse.json(emptyAvailability),
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('availability-grid')).toBeInTheDocument();
    });
    // Grid should have day headers
    expect(screen.getByText('MON')).toBeInTheDocument();
    expect(screen.getByText('SUN')).toBeInTheDocument();
  });

  it('pre-fills slots from API data', async () => {
    server.use(
      http.get('/api/v1/players/profile-1/availability', () =>
        HttpResponse.json(populatedAvailability),
      ),
    );
    renderPage();
    await waitFor(() => {
      // MON 16:00 and 17:00 should be pre-selected
      const cell = screen.getByRole('checkbox', { name: /monday at 16:00/i });
      expect(cell).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('toggling a cell marks it selected (dirty state)', async () => {
    server.use(
      http.get('/api/v1/players/profile-1/availability', () =>
        HttpResponse.json(emptyAvailability),
      ),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('availability-grid')).toBeInTheDocument());

    const user = userEvent.setup();
    const cell = screen.getByRole('checkbox', { name: /tuesday at 08:00/i });
    expect(cell).toHaveAttribute('aria-checked', 'false');
    await user.click(cell);
    expect(cell).toHaveAttribute('aria-checked', 'true');

    // Save button should now be enabled
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('PUT sends correct slots on save', async () => {
    let putBody: unknown = null;
    server.use(
      http.get('/api/v1/players/profile-1/availability', () =>
        HttpResponse.json(emptyAvailability),
      ),
      http.put('/api/v1/players/profile-1/availability', async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json(emptyAvailability);
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('availability-grid')).toBeInTheDocument());

    const user = userEvent.setup();
    // Select FRI 17:00 and 18:00
    await user.click(screen.getByRole('checkbox', { name: /friday at 17:00/i }));
    await user.click(screen.getByRole('checkbox', { name: /friday at 18:00/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(putBody).not.toBeNull();
      const body = putBody as { slots: Array<{ dayOfWeek: string; startTime: string; endTime: string }> };
      expect(body.slots).toHaveLength(1);
      expect(body.slots[0].dayOfWeek).toBe('FRI');
      expect(body.slots[0].startTime).toBe('17:00');
      expect(body.slots[0].endTime).toBe('19:00');
    });
  });

  it('shows save confirmation message', async () => {
    server.use(
      http.get('/api/v1/players/profile-1/availability', () =>
        HttpResponse.json(emptyAvailability),
      ),
      http.put('/api/v1/players/profile-1/availability', () =>
        HttpResponse.json(emptyAvailability),
      ),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('availability-grid')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: /monday at 09:00/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/availability saved/i);
    });
  });

  it('axe a11y smoke — no serious/critical violations', async () => {
    server.use(
      http.get('/api/v1/players/profile-1/availability', () =>
        HttpResponse.json(populatedAvailability),
      ),
    );
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId('availability-grid')).toBeInTheDocument());

    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical).toHaveLength(0);
  });

  it('shows message when no profile selected', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    // me with no activeContext
    qc.setQueryData(ME_QUERY_KEY, { ...mockMe, activeContext: null });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <BestTimesGrid />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText(/no active profile/i)).toBeInTheDocument();
  });
});

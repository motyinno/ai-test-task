/**
 * FI-3 MyTimesGrid tests — RTL + MSW
 * Covers: loading, data state, toggle interaction, PUT on save, axe a11y smoke
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MyTimesGrid from '@/pages/MyTimesGrid';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MyTimesGrid />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const emptyAvailability = { slots: [] };
const populatedAvailability = {
  slots: [
    { dayOfWeek: 'TUE', startTime: '08:00', endTime: '10:00' },
    { dayOfWeek: 'THU', startTime: '17:00', endTime: '19:00' },
  ],
};

describe('MyTimesGrid', () => {
  it('shows loading state', () => {
    server.use(
      http.get('/api/v1/coaches/me/availability', async () => {
        await new Promise(() => {});
        return HttpResponse.json(emptyAvailability);
      }),
    );
    renderPage();
    expect(screen.getByRole('status', { name: /loading availability/i })).toBeInTheDocument();
  });

  it('renders grid with day headers', async () => {
    server.use(
      http.get('/api/v1/coaches/me/availability', () =>
        HttpResponse.json(emptyAvailability),
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('availability-grid')).toBeInTheDocument();
    });
    expect(screen.getByText('MON')).toBeInTheDocument();
    expect(screen.getByText('FRI')).toBeInTheDocument();
  });

  it('pre-fills existing slots', async () => {
    server.use(
      http.get('/api/v1/coaches/me/availability', () =>
        HttpResponse.json(populatedAvailability),
      ),
    );
    renderPage();
    await waitFor(() => {
      const cell = screen.getByRole('checkbox', { name: /tuesday at 08:00/i });
      expect(cell).toHaveAttribute('aria-checked', 'true');
    });
    // Non-selected cell
    const unselected = screen.getByRole('checkbox', { name: /monday at 06:00/i });
    expect(unselected).toHaveAttribute('aria-checked', 'false');
  });

  it('toggling cell enables Save button', async () => {
    server.use(
      http.get('/api/v1/coaches/me/availability', () =>
        HttpResponse.json(emptyAvailability),
      ),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('availability-grid')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: /saturday at 10:00/i }));

    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('PUT sends correct slot ranges on save', async () => {
    let putBody: unknown = null;
    server.use(
      http.get('/api/v1/coaches/me/availability', () =>
        HttpResponse.json(emptyAvailability),
      ),
      http.put('/api/v1/coaches/me/availability', async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json(emptyAvailability);
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('availability-grid')).toBeInTheDocument());

    const user = userEvent.setup();
    // Select WED 14:00, 15:00, 16:00
    await user.click(screen.getByRole('checkbox', { name: /wednesday at 14:00/i }));
    await user.click(screen.getByRole('checkbox', { name: /wednesday at 15:00/i }));
    await user.click(screen.getByRole('checkbox', { name: /wednesday at 16:00/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(putBody).not.toBeNull();
      const body = putBody as { slots: Array<{ dayOfWeek: string; startTime: string; endTime: string }> };
      // 3 consecutive hours → 1 slot 14:00–17:00
      expect(body.slots).toHaveLength(1);
      expect(body.slots[0]).toMatchObject({
        dayOfWeek: 'WED',
        startTime: '14:00',
        endTime: '17:00',
      });
    });
  });

  it('multiple non-consecutive slots are split into separate ranges', async () => {
    let putBody: unknown = null;
    server.use(
      http.get('/api/v1/coaches/me/availability', () =>
        HttpResponse.json(emptyAvailability),
      ),
      http.put('/api/v1/coaches/me/availability', async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json(emptyAvailability);
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('availability-grid')).toBeInTheDocument());

    const user = userEvent.setup();
    // Morning: MON 07:00–08:00, Evening: MON 19:00–20:00 (gap in between)
    await user.click(screen.getByRole('checkbox', { name: /monday at 07:00/i }));
    await user.click(screen.getByRole('checkbox', { name: /monday at 19:00/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(putBody).not.toBeNull();
      const body = putBody as { slots: Array<{ dayOfWeek: string }> };
      // 2 non-consecutive hours → 2 separate slots
      expect(body.slots).toHaveLength(2);
    });
  });

  it('axe a11y smoke — no serious/critical violations', async () => {
    server.use(
      http.get('/api/v1/coaches/me/availability', () =>
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
});

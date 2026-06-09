/**
 * FI-1 FamilyDashboard tests — RTL + MSW
 * Covers: loading, empty, data, error states + key interactions
 * + axe a11y smoke + security/correctness paths
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import FamilyDashboard from '@/pages/FamilyDashboard';

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <FamilyDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockChild = {
  id: 'child-1',
  name: 'Maya',
  dateOfBirth: '2012-05-15',
  age: 13,
  ageGroup: 'U14',
  gender: 'FEMALE',
  school: 'Lincoln Middle',
  skillLevel: 'ADVANCED',
  trainers: [
    { trainerId: 'trainer-1', trainerName: 'Coach Bob' },
  ],
  createdAt: '2025-01-01T00:00:00Z',
};

const emptyResponse = { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
const dataResponse = { data: [mockChild], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } };

describe('FamilyDashboard', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get('/api/v1/players/me/children', async () => {
        // Delay indefinitely for loading test
        await new Promise(() => {});
        return HttpResponse.json(emptyResponse);
      }),
    );
    renderPage();
    expect(screen.getByRole('status', { name: /loading players/i })).toBeInTheDocument();
  });

  it('shows empty state when no children', async () => {
    server.use(
      http.get('/api/v1/players/me/children', () => HttpResponse.json(emptyResponse)),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/no players yet/i)).toBeInTheDocument();
  });

  it('renders child player card with skill chip + age/ageGroup labels', async () => {
    server.use(
      http.get('/api/v1/players/me/children', () => HttpResponse.json(dataResponse)),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Maya')).toBeInTheDocument();
    });
    // Q-01.01: Skill chip
    expect(screen.getByLabelText(/skill level: advanced/i)).toBeInTheDocument();
    // Q-01.02: Age + ageGroup
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText(/U14/)).toBeInTheDocument();
    // Trainer association
    expect(screen.getByText('Coach Bob')).toBeInTheDocument();
  });

  it('shows error state when API fails', async () => {
    server.use(
      http.get('/api/v1/players/me/children', () =>
        HttpResponse.json({ statusCode: 500, message: 'Server error' }, { status: 500 }),
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/failed to load players/i)).toBeInTheDocument();
  });

  it('opens add player sheet and validates dateOfBirth age range', async () => {
    server.use(
      http.get('/api/v1/players/me/children', () => HttpResponse.json(emptyResponse)),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

    const user = userEvent.setup();
    // Click the header "Add Player" button (not the form submit)
    const addPlayerButtons = screen.getAllByRole('button', { name: /add player/i });
    await user.click(addPlayerButtons[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Fill name but invalid age (too old)
    await user.type(screen.getByLabelText(/player name/i), 'Test Kid');
    await user.type(screen.getByLabelText(/date of birth/i), '1990-01-01');
    await user.selectOptions(screen.getByLabelText(/gender/i), 'MALE');
    // Click the form submit button inside the dialog
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^add player$/i }));

    await waitFor(() => {
      expect(screen.getByText(/18 or younger/i)).toBeInTheDocument();
    });
  });

  it('creates a child when valid data submitted', async () => {
    let createCalled = false;
    server.use(
      http.get('/api/v1/players/me/children', () => HttpResponse.json(emptyResponse)),
      http.post('/api/v1/players/me/children', async ({ request }) => {
        const body = await request.json() as { name: string; dateOfBirth: string; gender: string };
        expect(body.name).toBe('Alex');
        expect(body.dateOfBirth).toBe('2012-06-01');
        expect(body.gender).toBe('MALE');
        createCalled = true;
        return HttpResponse.json({
          ...mockChild,
          id: 'child-new',
          name: 'Alex',
          dateOfBirth: '2012-06-01',
          gender: 'MALE',
          trainers: [],
        }, { status: 201 });
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

    const user = userEvent.setup();
    const addPlayerBtns = screen.getAllByRole('button', { name: /add player/i });
    await user.click(addPlayerBtns[0]);
    await user.type(screen.getByLabelText(/player name/i), 'Alex');
    await user.type(screen.getByLabelText(/date of birth/i), '2012-06-01');
    await user.selectOptions(screen.getByLabelText(/gender/i), 'MALE');
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^add player$/i }));

    await waitFor(() => expect(createCalled).toBe(true));
  });

  it('removes trainer after confirmation dialog', async () => {
    let deleteCalled = false;
    server.use(
      http.get('/api/v1/players/me/children', () => HttpResponse.json(dataResponse)),
      http.delete('/api/v1/players/me/children/child-1/trainers/trainer-1', () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Coach Bob')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /remove trainer coach bob/i }));

    // Confirm dialog appears
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /remove trainer/i })).toBeInTheDocument();
    });
    // The dialog says "Remove Coach Bob from this player?"
    const dialog = screen.getByRole('dialog', { name: /remove trainer/i });
    expect(within(dialog).getByText(/coach bob/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(deleteCalled).toBe(true));
  });

  it('calls add-trainer endpoint', async () => {
    let addCalled = false;
    server.use(
      http.get('/api/v1/players/me/children', () => HttpResponse.json(dataResponse)),
      http.post('/api/v1/players/me/children/child-1/trainers', async ({ request }) => {
        const body = await request.json() as { trainerId?: string };
        expect(body.trainerId).toBe('trainer-uuid-2');
        addCalled = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Maya')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add trainer/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/trainer id/i), 'trainer-uuid-2');
    const addTrainerDialog = screen.getByRole('dialog');
    await user.click(within(addTrainerDialog).getByRole('button', { name: /^add trainer$/i }));
    await waitFor(() => expect(addCalled).toBe(true));
  });

  it('age too young (0 or negative) fails validation', async () => {
    server.use(
      http.get('/api/v1/players/me/children', () => HttpResponse.json(emptyResponse)),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

    const user = userEvent.setup();
    const btns = screen.getAllByRole('button', { name: /add player/i });
    await user.click(btns[0]);
    await user.type(screen.getByLabelText(/player name/i), 'Newborn');
    // A future date (next year)
    const nextYear = new Date().getFullYear() + 1;
    await user.type(screen.getByLabelText(/date of birth/i), `${nextYear}-01-01`);
    await user.selectOptions(screen.getByLabelText(/gender/i), 'FEMALE');
    const dlg = screen.getByRole('dialog');
    await user.click(within(dlg).getByRole('button', { name: /^add player$/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 1 year old/i)).toBeInTheDocument();
    });
  });

  it('axe a11y smoke — no serious/critical violations', async () => {
    server.use(
      http.get('/api/v1/players/me/children', () => HttpResponse.json(dataResponse)),
    );
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('Maya')).toBeInTheDocument());

    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical).toHaveLength(0);
  });
});

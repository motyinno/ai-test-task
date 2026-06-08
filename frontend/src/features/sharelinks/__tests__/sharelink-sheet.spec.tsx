import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ShareLinkSheet } from '../ShareLinkSheet';

const mockStaticLink = {
  id: 'link-1',
  code: 'ABC123XYZ',
  url: 'https://app.example.com/join/ABC123XYZ',
  type: 'STATIC',
  useCount: 14,
  active: true,
};

const mockUniqueLink = {
  id: 'link-2',
  code: 'UNIQUE-DEF',
  url: 'https://app.example.com/join/UNIQUE-DEF',
  type: 'UNIQUE',
  targetEmail: 'coach@example.com',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  useCount: 0,
  maxUses: 1,
  active: true,
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return { qc, Wrapper };
}

function TestHarness() {
  const [open, setOpen] = useState(true);
  return <ShareLinkSheet isOpen={open} onClose={() => setOpen(false)} />;
}

describe('ShareLinkSheet', () => {
  it('renders the sheet with STATIC/UNIQUE type toggle', async () => {
    server.use(
      http.get('/api/v1/sharelinks', () =>
        HttpResponse.json({ data: [mockStaticLink], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      ),
    );

    const { Wrapper } = makeWrapper();
    render(<Wrapper><TestHarness /></Wrapper>);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Should have a type switcher
    await waitFor(() => {
      expect(screen.getByText(/STATIC/i)).toBeInTheDocument();
      expect(screen.getByText(/UNIQUE/i)).toBeInTheDocument();
    });
  });

  it('shows static link with mono code and copy button', async () => {
    server.use(
      http.get('/api/v1/sharelinks', () =>
        HttpResponse.json({ data: [mockStaticLink], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      ),
    );

    const { Wrapper } = makeWrapper();
    render(<Wrapper><TestHarness /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText('ABC123XYZ')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });

  it('shows link creation button when no links exist', async () => {
    server.use(
      http.get('/api/v1/sharelinks', () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
      ),
    );

    const { Wrapper } = makeWrapper();
    render(<Wrapper><TestHarness /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate|create link/i })).toBeInTheDocument();
    });
  });

  it('shows generate button and revoked history when link is revoked', async () => {
    const revokedLink = { ...mockStaticLink, active: false };
    server.use(
      http.get('/api/v1/sharelinks', () =>
        HttpResponse.json({ data: [revokedLink], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      ),
    );

    const { Wrapper } = makeWrapper();
    render(<Wrapper><TestHarness /></Wrapper>);

    // When active link is revoked (inactive), the "generate" button should appear
    // and "REVOKED" text should be shown in the history
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate|create link/i })).toBeInTheDocument();
    }, { timeout: 3000 });

    // Revoked state shown: REVOKED text appears + link code
    const revokedMatches = screen.queryAllByText(/REVOKED/i);
    expect(revokedMatches.length).toBeGreaterThan(0);
    const codeMatches = screen.queryAllByText(/ABC123XYZ/i);
    expect(codeMatches.length).toBeGreaterThan(0);
  });

  it('shows targetEmail field for UNIQUE type', async () => {
    server.use(
      http.get('/api/v1/sharelinks', () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
      ),
    );

    const { Wrapper } = makeWrapper();
    render(<Wrapper><TestHarness /></Wrapper>);

    await waitFor(() => screen.getByRole('dialog'));

    // Switch to UNIQUE
    const uniqueBtn = screen.getByRole('button', { name: /unique/i });
    await userEvent.click(uniqueBtn);

    await waitFor(() => {
      expect(screen.getByLabelText(/target email|recipient email/i)).toBeInTheDocument();
    });
  });
});

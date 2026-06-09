/**
 * FI-5 TrainerBranding tests — RTL + MSW
 * Covers: loading, data, color picker live preview, logo upload, save, axe a11y
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import TrainerBranding from '@/pages/TrainerBranding';
import { BrandProvider } from '@/providers/brand-provider';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // We need a real BrandProvider to test live preview
  const container = document.createElement('div');
  document.body.appendChild(container);

  return render(
    <QueryClientProvider client={qc}>
      <BrandProvider>
        <MemoryRouter>
          <TrainerBranding />
        </MemoryRouter>
      </BrandProvider>
    </QueryClientProvider>,
  );
}

const mockBranding = {
  logoUrl: 'https://example.com/logo.png',
  primaryColorHex: '#1E88E5',
};

describe('TrainerBranding', () => {
  it('shows loading state', () => {
    server.use(
      http.get('/api/v1/trainers/me/branding', async () => {
        await new Promise(() => {});
        return HttpResponse.json(mockBranding);
      }),
    );
    renderPage();
    expect(screen.getByRole('status', { name: /loading branding/i })).toBeInTheDocument();
  });

  it('populates color input from server data', async () => {
    server.use(
      http.get('/api/v1/trainers/me/branding', () => HttpResponse.json(mockBranding)),
    );
    renderPage();
    await waitFor(() => {
      const input = screen.getByRole('textbox', { name: /brand color hex value/i });
      expect((input as HTMLInputElement).value).toBe('#1E88E5');
    });
  });

  it('live preview updates --brand-primary when color changes', async () => {
    server.use(
      http.get('/api/v1/trainers/me/branding', () => HttpResponse.json(mockBranding)),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /brand color hex value/i })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: /brand color hex value/i });

    // Clear and type a new color
    await user.clear(input);
    await user.type(input, '#FF5500');

    await waitFor(() => {
      // --brand-primary should be updated on document.documentElement
      const brandPrimary = document.documentElement.style.getPropertyValue('--brand-primary');
      expect(brandPrimary).toBe('#FF5500');
    });
  });

  it('shows error for invalid hex value', async () => {
    server.use(
      http.get('/api/v1/trainers/me/branding', () => HttpResponse.json(mockBranding)),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /brand color hex value/i })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: /brand color hex value/i });
    await user.clear(input);
    await user.type(input, 'notacolor');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/valid hex color/i)).toBeInTheDocument();
    });
  });

  it('calls PUT on save with correct color', async () => {
    let putBody: unknown = null;
    server.use(
      http.get('/api/v1/trainers/me/branding', () => HttpResponse.json(mockBranding)),
      http.put('/api/v1/trainers/me/branding', async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json({ ...mockBranding, primaryColorHex: '#AA1122' });
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /brand color hex value/i })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: /brand color hex value/i });
    await user.clear(input);
    await user.type(input, '#AA1122');

    await user.click(screen.getByRole('button', { name: /save branding/i }));

    await waitFor(() => {
      expect(putBody).not.toBeNull();
      const body = putBody as { primaryColorHex: string };
      expect(body.primaryColorHex).toBe('#AA1122');
    });
  });

  it('shows success message after save', async () => {
    server.use(
      http.get('/api/v1/trainers/me/branding', () => HttpResponse.json(mockBranding)),
      http.put('/api/v1/trainers/me/branding', () =>
        HttpResponse.json({ ...mockBranding, primaryColorHex: '#00AA00' }),
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /brand color hex value/i })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: /brand color hex value/i });
    await user.clear(input);
    await user.type(input, '#00AA00');

    await user.click(screen.getByRole('button', { name: /save branding/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/branding saved/i);
    });
  });

  it('rejects logo files larger than 2MB', async () => {
    server.use(
      http.get('/api/v1/trainers/me/branding', () => HttpResponse.json(mockBranding)),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upload logo/i })).toBeInTheDocument();
    });

    // Create a >2MB file
    const largeFile = new File(['x'.repeat(3 * 1024 * 1024)], 'large.png', { type: 'image/png' });
    const input = screen.getByRole('button', { name: /upload logo/i }).previousElementSibling as HTMLInputElement;

    // Trigger file change directly since the input is hidden
    fireEvent.change(screen.getByLabelText(/upload logo/i), {
      target: { files: [largeFile] },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/smaller than 2MB/i);
    });
  });

  it('rejects non-image file types', async () => {
    server.use(
      http.get('/api/v1/trainers/me/branding', () => HttpResponse.json(mockBranding)),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/upload logo/i)).toBeInTheDocument();
    });

    const badFile = new File(['data'], 'document.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/upload logo/i), {
      target: { files: [badFile] },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/PNG, JPG, and SVG/i);
    });
  });

  it('axe a11y smoke — no serious/critical violations', async () => {
    server.use(
      http.get('/api/v1/trainers/me/branding', () => HttpResponse.json(mockBranding)),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /brand color hex value/i })).toBeInTheDocument();
    });

    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical).toHaveLength(0);
  });
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// We test each primitive individually
import { Button } from '../Button';
import { Input } from '../Input';
import { Sheet } from '../Sheet';
import { DataTable } from '../DataTable';
import { StatNumber } from '../StatNumber';

// ─── Button ───────────────────────────────────────────────────────────────────

describe('Button', () => {
  it('renders with accessible name', () => {
    render(<Button>Submit</Button>);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Click me</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is disabled in loading state', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not fire onClick when disabled', async () => {
    const handler = vi.fn();
    render(<Button disabled onClick={handler}>Disabled</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).not.toHaveBeenCalled();
  });
});

// ─── Input ────────────────────────────────────────────────────────────────────

describe('Input', () => {
  it('associates label with input via htmlFor/id', () => {
    render(<Input id="email" label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toBeInTheDocument();
  });

  it('shows error text and sets aria-invalid when error is provided', () => {
    render(<Input id="email" label="Email" error="Invalid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
    // aria-describedby should point to the error element
    const errorId = input.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent('Invalid email');
  });

  it('does not set aria-invalid without error', () => {
    render(<Input id="name" label="Name" />);
    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
  });
});

// ─── Sheet ────────────────────────────────────────────────────────────────────

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet isOpen={false} onClose={() => {}}>
        <div data-testid="sheet-content">Content</div>
      </Sheet>,
    );
    expect(screen.queryByTestId('sheet-content')).not.toBeInTheDocument();
  });

  it('renders content when open', () => {
    render(
      <Sheet isOpen={true} onClose={() => {}}>
        <div data-testid="sheet-content">Content</div>
      </Sheet>,
    );
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    render(
      <Sheet isOpen={true} onClose={onClose}>
        <button>Focus me</button>
      </Sheet>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has a dialog role', () => {
    render(
      <Sheet isOpen={true} onClose={() => {}}>
        <div>Content</div>
      </Sheet>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// ─── DataTable ────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string;
  email: string;
}

const mockColumns = [
  { key: 'name' as const, header: 'Name' },
  { key: 'email' as const, header: 'Email' },
];

const mockData: UserRow[] = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
];

const mockMeta = { page: 1, limit: 20, total: 2, totalPages: 1 };

describe('DataTable', () => {
  it('renders column headers with scope="col"', () => {
    render(
      <DataTable<UserRow>
        columns={mockColumns}
        data={mockData}
        meta={mockMeta}
        rowKey="id"
      />,
    );
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    expect(nameHeader).toHaveAttribute('scope', 'col');
  });

  it('renders row data from {data, meta} envelope', () => {
    render(
      <DataTable<UserRow>
        columns={mockColumns}
        data={mockData}
        meta={mockMeta}
        rowKey="id"
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('shows empty state when data array is empty', () => {
    render(
      <DataTable<UserRow>
        columns={mockColumns}
        data={[]}
        meta={{ page: 1, limit: 20, total: 0, totalPages: 0 }}
        rowKey="id"
      />,
    );
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });
});

// ─── StatNumber ───────────────────────────────────────────────────────────────

describe('StatNumber', () => {
  it('renders the value with tabular-nums styling cue', () => {
    render(<StatNumber value={12481} label="USERS" />);
    // Value rendered via aria-label (accessible text)
    expect(screen.getByLabelText('12481 USERS')).toBeInTheDocument();
    expect(screen.getByText('USERS')).toBeInTheDocument();
  });

  it('skips count-up animation when prefers-reduced-motion is reduce', () => {
    // Mock matchMedia to simulate reduced motion
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });

    render(<StatNumber value={42} label="COUNT" />);
    // With reduced motion, the value should render immediately (not as 0 mid-animation)
    expect(screen.getByText('42')).toBeInTheDocument();

    // Restore
    Object.defineProperty(window, 'matchMedia', { writable: true, value: originalMatchMedia });
  });
});

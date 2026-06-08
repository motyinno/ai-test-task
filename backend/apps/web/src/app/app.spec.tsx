import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './app';

describe('App', () => {
  it('renders a root landmark', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

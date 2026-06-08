import '@testing-library/jest-dom';
import { server } from './mocks/server';
import { clearCsrfCache } from './api/client';

// jsdom doesn't implement window.matchMedia — provide a stub
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => {
  server.resetHandlers();
  clearCsrfCache();
});
afterAll(() => server.close());

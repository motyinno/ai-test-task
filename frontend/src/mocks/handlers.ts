import { http, HttpResponse } from 'msw';

export const handlers = [
  // Default CSRF handler
  http.get('/api/v1/auth/csrf', () => {
    return HttpResponse.json({ token: 'test-csrf-token' });
  }),
];

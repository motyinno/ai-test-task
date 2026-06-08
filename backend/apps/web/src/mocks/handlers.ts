import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/v1/auth/me', () => {
    return HttpResponse.json(null, { status: 401 });
  }),
  http.get('/api/v1/auth/csrf', () => {
    return HttpResponse.json({ token: 'test-csrf-token' });
  }),
];

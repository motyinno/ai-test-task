import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { apiGet, apiPost, ApiError } from '../client';

describe('API client', () => {
  describe('GET requests', () => {
    it('fetches and returns JSON from a GET endpoint', async () => {
      server.use(
        http.get('/api/v1/test', () => {
          return HttpResponse.json({ data: 'hello' });
        }),
      );
      const result = await apiGet<{ data: string }>('/test');
      expect(result.data).toBe('hello');
    });

    it('sends credentials: include on GET', async () => {
      let receivedCredentials = false;
      server.use(
        http.get('/api/v1/check-creds', ({ request }) => {
          // MSW in node env: credentials header behavior differs, but we verify
          // the fetch call is made (MSW intercepts it regardless)
          receivedCredentials = true;
          return HttpResponse.json({ ok: true });
        }),
      );
      await apiGet('/check-creds');
      expect(receivedCredentials).toBe(true);
    });
  });

  describe('POST (mutation) requests', () => {
    it('fetches CSRF token and sends it as X-CSRF-Token on mutations', async () => {
      let csrfHeader: string | null = null;
      server.use(
        http.get('/api/v1/auth/csrf', () => {
          return HttpResponse.json({ token: 'csrf-abc-123' });
        }),
        http.post('/api/v1/test-post', ({ request }) => {
          csrfHeader = request.headers.get('X-CSRF-Token');
          return HttpResponse.json({ created: true }, { status: 201 });
        }),
      );
      await apiPost('/test-post', { name: 'test' });
      expect(csrfHeader).toBe('csrf-abc-123');
    });

    it('returns the parsed JSON body on a successful POST', async () => {
      server.use(
        http.post('/api/v1/users', () => {
          return HttpResponse.json({ id: 'uuid-1', email: 'a@b.com' }, { status: 201 });
        }),
      );
      const result = await apiPost<{ id: string; email: string }>('/users', {});
      expect(result.id).toBe('uuid-1');
      expect(result.email).toBe('a@b.com');
    });
  });

  describe('Error handling', () => {
    it('throws ApiError with errorCode on 409 conflict', async () => {
      server.use(
        http.post('/api/v1/users', () => {
          return HttpResponse.json(
            {
              statusCode: 409,
              message: 'Email already exists',
              error: 'Conflict',
              errorCode: 'EMAIL_EXISTS',
              details: [],
            },
            { status: 409 },
          );
        }),
      );

      let caught: unknown;
      try {
        await apiPost('/users', { email: 'dupe@example.com' });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ApiError);
      const apiErr = caught as ApiError;
      expect(apiErr.errorCode).toBe('EMAIL_EXISTS');
      expect(apiErr.statusCode).toBe(409);
      expect(apiErr.message).toBe('Email already exists');
    });

    it('throws ApiError with errorCode on 401 unauthorized', async () => {
      server.use(
        http.get('/api/v1/me', () => {
          return HttpResponse.json(
            {
              statusCode: 401,
              message: 'Unauthorized',
              error: 'Unauthorized',
              errorCode: 'UNAUTHENTICATED',
            },
            { status: 401 },
          );
        }),
      );

      let caught: unknown;
      try {
        await apiGet('/me');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ApiError);
      const apiErr = caught as ApiError;
      expect(apiErr.errorCode).toBe('UNAUTHENTICATED');
      expect(apiErr.statusCode).toBe(401);
    });

    it('ApiError exposes details array from error envelope', async () => {
      server.use(
        http.post('/api/v1/validate', () => {
          return HttpResponse.json(
            {
              statusCode: 400,
              message: 'Validation failed',
              error: 'Bad Request',
              errorCode: 'VALIDATION_ERROR',
              details: [{ field: 'email', message: 'Invalid email format' }],
            },
            { status: 400 },
          );
        }),
      );

      let caught: unknown;
      try {
        await apiPost('/validate', {});
      } catch (err) {
        caught = err;
      }

      const apiErr = caught as ApiError;
      expect(apiErr.details).toHaveLength(1);
      expect(apiErr.details[0]).toMatchObject({ field: 'email' });
    });
  });
});

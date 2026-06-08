import { ApiError } from './errors';

export { ApiError } from './errors';

const BASE = '/api/v1';

/** Lazily fetched CSRF token — cached per session. */
let csrfTokenCache: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfTokenCache) return csrfTokenCache;
  const res = await fetch(`${BASE}/auth/csrf`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError('Failed to fetch CSRF token', res.status, 'CSRF_FETCH_FAILED');
  }
  const json = await res.json();
  csrfTokenCache = json.token as string;
  return csrfTokenCache;
}

/** Clear the cached CSRF token (call on logout). */
export function clearCsrfCache() {
  csrfTokenCache = null;
}

/**
 * Core fetch wrapper.
 * - Always sends `credentials: 'include'` (session cookie).
 * - For unsafe methods (POST/PATCH/PUT/DELETE), fetches and attaches CSRF token.
 * - On non-2xx, parses the Nest error envelope into a typed ApiError.
 */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const isUnsafe = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method.toUpperCase());

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extraHeaders,
  };

  if (isUnsafe) {
    const csrf = await getCsrfToken();
    headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${BASE}${path}`, {
    method: method.toUpperCase(),
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 204 No Content
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    if (!res.ok) {
      throw new ApiError(res.statusText, res.status, 'PARSE_ERROR');
    }
    return undefined as unknown as T;
  }

  if (!res.ok) {
    const envelope = json as {
      statusCode?: number;
      message?: string;
      error?: string;
      errorCode?: string;
      details?: Array<{ field?: string; message: string }>;
    };
    throw new ApiError(
      envelope.message ?? res.statusText,
      envelope.statusCode ?? res.status,
      envelope.errorCode ?? 'UNKNOWN_ERROR',
      envelope.details ?? [],
    );
  }

  return json as T;
}

export const apiGet = <T>(path: string) => request<T>('GET', path);

export const apiPost = <T>(path: string, body?: unknown) =>
  request<T>('POST', path, body);

export const apiPatch = <T>(path: string, body?: unknown) =>
  request<T>('PATCH', path, body);

export const apiPut = <T>(path: string, body?: unknown) =>
  request<T>('PUT', path, body);

export const apiDelete = <T>(path: string, body?: unknown) =>
  request<T>('DELETE', path, body);

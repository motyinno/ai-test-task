import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import 'express-session';
import * as crypto from 'crypto';

type SessionRecord = Record<string, unknown>;

/** Unsafe HTTP methods that require CSRF token validation. */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Routes exempt from CSRF validation (pre-session or login flows). */
const CSRF_EXEMPT_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/password-reset',
  '/api/v1/auth/password-reset/confirm',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/verify-email/resend',
  '/api/v1/join',
]);

function isExempt(path: string): boolean {
  if (CSRF_EXEMPT_PATHS.has(path)) return true;
  // Exempt paths that start with /join/:code
  if (path.startsWith('/api/v1/join/')) return true;
  // Test-only routes exempt in test environment
  if (process.env['NODE_ENV'] === 'test' && path.startsWith('/api/v1/session-test/')) return true;
  return false;
}

/**
 * Double-submit CSRF protection (SEC-003).
 * - GET /auth/csrf mints a token and stores it in the session.
 * - All unsafe method requests must carry the matching token in X-CSRF-Token header.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (!UNSAFE_METHODS.has(req.method)) {
      return next();
    }

    if (isExempt(req.path)) {
      return next();
    }

    const session = req.session as unknown as SessionRecord;
    const sessionToken = session?.['csrfToken'] as string | undefined;
    const headerToken = req.headers['x-csrf-token'] as string | undefined;

    if (!sessionToken || !headerToken || !this.safeCompare(sessionToken, headerToken)) {
      throw new ForbiddenException({
        message: 'CSRF token invalid or missing',
        errorCode: 'CSRF_INVALID',
      });
    }

    // Rotate token after successful validation (optional but good practice)
    session['csrfToken'] = crypto.randomBytes(24).toString('base64url');

    return next();
  }

  private safeCompare(a: string, b: string): boolean {
    try {
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }
}

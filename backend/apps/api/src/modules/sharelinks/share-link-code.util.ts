import { randomBytes } from 'crypto';

/**
 * Generates an opaque, unsigned, ~256-bit URL-safe token.
 *
 * Design (D4): The DB row is the source of truth — the token is just a random
 * credential that maps to a row. It is NOT a signed/verifiable JWT.
 *
 * Uses Node.js `crypto.randomBytes` (CSPRNG) via base64url encoding (RFC 4648 §5),
 * which strips padding characters and uses URL-safe alphabet (A-Z, a-z, 0-9, -, _).
 */
export function generateShareLinkCode(): string {
  return randomBytes(32).toString('base64url');
}

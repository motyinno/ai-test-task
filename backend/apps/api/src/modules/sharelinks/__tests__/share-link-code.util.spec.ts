import { generateShareLinkCode } from '../share-link-code.util';

describe('generateShareLinkCode', () => {
  it('produces a URL-safe high-entropy token', () => {
    const code = generateShareLinkCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    expect(code.length).toBeGreaterThanOrEqual(32);
  });

  it('is collision-resistant across many calls', () => {
    const set = new Set(Array.from({ length: 5000 }, () => generateShareLinkCode()));
    expect(set.size).toBe(5000);
  });

  it('produces 43 characters (32 bytes base64url without padding)', () => {
    const code = generateShareLinkCode();
    // 32 bytes = ceil(32 * 4/3) = 43 base64url chars (no padding)
    expect(code.length).toBe(43);
  });
});
